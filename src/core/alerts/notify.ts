import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { captureError } from '../analytics/capture-error'
import type { ServerErrorSignal } from '../analytics/server-errors'
import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { logger, redactString } from '../logger'
import { appOrigin } from '../site-url'
import { r2MarkerStore } from '../storage/r2-store'
import { alertPolicy, type AlertBudget, type OwnerAlert } from './alert-kinds'
import { feishuConfig, type FeishuConfig } from './alerts-env'
import { createBackoff, type Backoff } from './backoff'
import { createDedupe, type Dedupe } from './dedupe'
import { enrich } from './enrich'
import { FeishuError, sendFeishu, type FeishuDeps } from './feishu'
import { isSpike, readFailureStats, spikeAlert } from './failure-spike'
import { schedule } from './schedule'
import { areaOf, createErrorWindow, sentryIssuesUrl, siteErrorsAlert, type ErrorBreach, type ErrorWindow } from './site-errors'
import { readSaleFloorHidden, SALE_FLOOR_CHECK_EVERY_MS, saleFloorAlert } from './sale-floor'
import { readSignupGiftToday, signupGiftAlert } from './signup-gift'
import { renderAlert } from './templates'

// notifyOwner (ARCHITECTURE §16.4, T72): the Owner's plain-Chinese business alert, posted to the
// Feishu group bot. Callers never wait for it: the work runs in after() (schedule.ts), and it
// never throws or changes what the caller does. A Feishu outage, a refused signature or a failed
// lookup is logged and sent to Sentry, nothing more. Without FEISHU_ALERT_WEBHOOK_URL and
// FEISHU_ALERT_SECRET nothing is done at all (previews by default).

const MINUTE = 60_000
const SPIKE_COOLDOWN_MS = 60 * MINUTE
const SITE_ERRORS_COOLDOWN_MS = 30 * MINUTE
// The failure-rate counts run at most this often per instance.
const SPIKE_CHECK_EVERY_MS = MINUTE
// Money alerts retry a Feishu rate limit this many times, after 2 s, then 4 s.
const MONEY_RETRIES = 2

export type NotifyDeps = {
  config: FeishuConfig | null
  db: () => SupabaseClient
  dedupe: Dedupe
  backoff: Backoff
  feishu: FeishuDeps
  origin: string
  testSite: boolean
  // This environment's Sentry issue list, linked from 「网站报错异常」.
  sentryUrl: string
  now: () => number
  sleep: (ms: number) => Promise<void>
  // When this instance last ran the failure-rate counts.
  lastSpikeCheck: { at: number }
  // When this instance last read which published templates are hidden (1295).
  lastSaleFloorCheck?: { at: number }
}

async function post(deps: NotifyDeps & { config: FeishuConfig }, text: string, money: boolean): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sendFeishu(deps.config, text, deps.feishu)
    } catch (error) {
      const retry = money && attempt < MONEY_RETRIES && error instanceof FeishuError && error.rateLimited
      if (!retry) throw error
      await deps.sleep(2000 * (attempt + 1))
    }
  }
}

async function deliver(deps: NotifyDeps & { config: FeishuConfig }, alert: OwnerAlert, money: boolean): Promise<void> {
  const { alert: full, who } = await enrich(deps.db(), alert)
  const { sentence, link } = renderAlert(full, { who, origin: deps.origin, testSite: deps.testSite })
  // The logger's redaction as a last net: no full email, phone number or token in the sentence.
  await post(deps, `${redactString(sentence)}\n${link}`, money)
}

// A timeout or a dropped connection may still have posted the message: keep the mark then, so
// the Owner never gets it twice. Only a definite refusal (or a failure before sending) frees it.
const mayHaveArrived = (error: unknown) => error instanceof FeishuError && !error.definite

// Ticket (and inquiry) alerts share an hourly budget; past it the alert's own mark is freed for later.
async function withinBudget(deps: NotifyDeps, key: string, budget: AlertBudget | undefined): Promise<boolean> {
  if (!budget || (await deps.dedupe.takeSlot(budget))) return true
  await deps.dedupe.release(key)
  logger.warn('owner alerts: hourly budget used up', { key, budget })
  return false
}

export async function notifyOwnerWith(deps: NotifyDeps, alert: OwnerAlert): Promise<void> {
  const { config } = deps
  if (!config) return
  const policy = alertPolicy(alert)
  // While Feishu keeps failing, only money alerts still try; nothing is claimed for the rest.
  if (!policy.money && deps.backoff.paused(deps.now())) return
  if (!(await deps.dedupe.claim(policy.key, policy.cooldownMs, policy.requireShared))) return
  if (!(await withinBudget(deps, policy.key, policy.budget))) return
  try {
    await deliver({ ...deps, config }, alert, policy.money)
    deps.backoff.succeeded()
    logger.info('owner alert sent', { kind: alert.kind, key: policy.key })
  } catch (error) {
    deps.backoff.failed(deps.now())
    if (!mayHaveArrived(error)) await deps.dedupe.release(policy.key)
    logger.warn('owner alert not sent', { kind: alert.kind, key: policy.key, error })
    captureError(error, { level: 'warning', fields: { owner_alert: alert.kind } })
  }
}

// After a generation failed (not a declined photo): alerts when the last hour's failure rate is
// high, at most once an hour. Skipped without a read while this instance knows the last alert is
// under an hour old, while sending backs off, or when it counted less than a minute ago.
export async function noteGenerationFailureWith(deps: NotifyDeps): Promise<void> {
  if (!deps.config || deps.dedupe.held('generation_spike', SPIKE_COOLDOWN_MS)) return
  const now = deps.now()
  if (deps.backoff.paused(now) || now - deps.lastSpikeCheck.at < SPIKE_CHECK_EVERY_MS) return
  deps.lastSpikeCheck.at = now
  try {
    const stats = await readFailureStats(deps.db(), now)
    if (isSpike(stats)) await notifyOwnerWith(deps, spikeAlert(stats))
  } catch (error) {
    logger.warn('generation failure-rate check failed', { error })
  }
}

// 1295: which published templates the catalogue leaves out, alerted once per hidden set. The cron
// passes force (it runs every 10 minutes anyway); a settled job checks at most every 10 minutes
// per instance. Returns how many are hidden (null: not checked), for the cron's log.
export async function checkSaleFloorWith(deps: NotifyDeps, opts: { force?: boolean } = {}): Promise<number | null> {
  if (!deps.config) return null
  const now = deps.now()
  const last = (deps.lastSaleFloorCheck ??= { at: 0 })
  if (!opts.force && (deps.backoff.paused(now) || now - last.at < SALE_FLOOR_CHECK_EVERY_MS)) return null
  last.at = now
  try {
    const rows = await readSaleFloorHidden(deps.db())
    const alert = saleFloorAlert(rows)
    if (alert) await notifyOwnerWith(deps, alert)
    return rows.length
  } catch (error) {
    logger.warn('sale floor check failed', { error })
    return null
  }
}

// 1350: after a new account's first sign-in, whether the day's signup gifts are half or all gone.
export async function noteSignupGiftWith(deps: NotifyDeps): Promise<void> {
  if (!deps.config || deps.backoff.paused(deps.now())) return
  try {
    const alert = signupGiftAlert(await readSignupGiftToday(deps.db()), deps.now())
    if (alert) await notifyOwnerWith(deps, alert)
  } catch (error) {
    logger.warn('signup gift check failed', { error })
  }
}

// Every server error passes here synchronously (core/analytics signalServerError): counted in the
// window; a breach is returned only when an alert could go out now.
export function recordServerError(deps: NotifyDeps, window: ErrorWindow, signal: ServerErrorSignal): ErrorBreach | null {
  if (!deps.config) return null
  const area = areaOf(signal)
  if (!area) return null
  const breach = window.record(area, deps.now())
  if (!breach || deps.dedupe.held('site_errors', SITE_ERRORS_COOLDOWN_MS) || deps.backoff.paused(deps.now())) return null
  return breach
}

export async function noteServerErrorWith(deps: NotifyDeps, window: ErrorWindow, signal: ServerErrorSignal): Promise<void> {
  const breach = recordServerError(deps, window, signal)
  if (breach) await notifyOwnerWith(deps, siteErrorsAlert(breach, deps.sentryUrl))
}

let defaults: NotifyDeps | null | undefined

function defaultDeps(): NotifyDeps | null {
  if (defaults !== undefined) return defaults
  try {
    const env = serverEnv()
    const { config, problem } = feishuConfig(env)
    if (problem) logger.warn('owner alerts are off', { problem })
    defaults = {
      config,
      db: createAdminSupabase,
      // The marker store has its own R2 client: one attempt, short timeouts. No R2: per instance.
      dedupe: createDedupe(() => r2MarkerStore()),
      backoff: createBackoff(),
      feishu: { fetch: (input, init) => fetch(input, init), now: Date.now },
      origin: appOrigin,
      testSite: env.VERCEL_ENV !== 'production',
      sentryUrl: sentryIssuesUrl(env.SENTRY_ORG, env.VERCEL_ENV ?? 'development'),
      now: Date.now,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      lastSpikeCheck: { at: 0 },
      lastSaleFloorCheck: { at: 0 },
    }
  } catch (error) {
    logger.warn('owner alert setup failed', { error })
    defaults = null
  }
  return defaults
}

// The three entry points. Each returns at once; the work runs in after().

export function notifyOwner(alert: OwnerAlert): void {
  const deps = defaultDeps()
  if (deps?.config) schedule(() => notifyOwnerWith(deps, alert))
}

export function noteGenerationFailure(): void {
  const deps = defaultDeps()
  if (deps?.config) schedule(() => noteGenerationFailureWith(deps))
}

// After a job settled with its cost: the job may have moved a route's p95 past a floor.
export function noteSaleFloorCheck(): void {
  const deps = defaultDeps()
  if (deps?.config) schedule(() => checkSaleFloorWith(deps).then(() => undefined))
}

export function noteSignupGift(): void {
  const deps = defaultDeps()
  if (deps?.config) schedule(() => noteSignupGiftWith(deps))
}

// The cron's run: awaited, so the function stays up until the alert is sent.
export async function checkSaleFloor(): Promise<number | null> {
  const deps = defaultDeps()
  return deps?.config ? checkSaleFloorWith(deps, { force: true }) : null
}

const errorWindow = createErrorWindow()

export function noteServerError(signal: ServerErrorSignal): void {
  const deps = defaultDeps()
  if (!deps) return
  const breach = recordServerError(deps, errorWindow, signal)
  if (breach) schedule(() => notifyOwnerWith(deps, siteErrorsAlert(breach, deps.sentryUrl)))
}
