import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { captureError } from '../analytics/capture-error'
import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { logger, redactString } from '../logger'
import { appOrigin } from '../site-url'
import { r2Store } from '../storage/r2-store'
import { dedupeKey, type OwnerAlert } from './alert-kinds'
import { feishuConfig, type FeishuConfig } from './alerts-env'
import { createDedupe, type Dedupe } from './dedupe'
import { enrich } from './enrich'
import { sendFeishu, type FeishuDeps } from './feishu'
import { isSpike, readFailureStats, spikeAlert, spikeHour } from './failure-spike'
import { renderAlert } from './templates'

// notifyOwner (ARCHITECTURE §16.4, T72): the Owner's plain-Chinese business alert, posted to the
// Feishu group bot. It never throws and never changes what the caller does: a Feishu outage,
// a refused signature or a failed lookup is logged and sent to Sentry, nothing more. Without
// FEISHU_ALERT_WEBHOOK_URL and FEISHU_ALERT_SECRET it returns at once (previews by default).
// Sentry's own alerts (captureAlert) stay where they are; this runs next to them.

export type NotifyDeps = {
  config: FeishuConfig | null
  db: () => SupabaseClient
  dedupe: Dedupe
  feishu: FeishuDeps
  origin: string
  testSite: boolean
}

async function deliver(deps: NotifyDeps & { config: FeishuConfig }, alert: OwnerAlert): Promise<void> {
  // A failed lookup only costs the masked name or the payment details, never the alert.
  const { alert: full, who } = await enrich(deps.db(), alert).catch(() => ({ alert, who: null }))
  const { sentence, link } = renderAlert(full, { who, origin: deps.origin, testSite: deps.testSite })
  // The logger's redaction as a last net: no full email, phone number or token in the sentence.
  await sendFeishu(deps.config, `${redactString(sentence)}\n${link}`, deps.feishu)
}

export async function notifyOwnerWith(deps: NotifyDeps, alert: OwnerAlert): Promise<void> {
  const { config } = deps
  if (!config) return
  const key = dedupeKey(alert)
  if (!(await deps.dedupe.claim(key))) return
  try {
    await deliver({ ...deps, config }, alert)
    logger.info('owner alert sent', { kind: alert.kind, key })
  } catch (error) {
    await deps.dedupe.release(key)
    logger.warn('owner alert not sent', { kind: alert.kind, key, error })
    captureError(error, { level: 'warning', fields: { owner_alert: alert.kind } })
  }
}

// Called after a generation failed (not a declined photo): alerts once per hour when the last
// hour's failure rate is high. The instance that already alerted this hour skips the read.
export async function noteGenerationFailureWith(deps: NotifyDeps, now: Date = new Date()): Promise<void> {
  if (!deps.config) return
  if (deps.dedupe.seen(`generation_spike:${spikeHour(now)}`)) return
  try {
    const stats = await readFailureStats(deps.db(), now)
    if (isSpike(stats)) await notifyOwnerWith(deps, spikeAlert(stats, now))
  } catch (error) {
    logger.warn('generation failure-rate check failed', { error })
  }
}

// The R2 bucket holds the dedupe marks; a deployment without R2 dedupes per instance only.
function markerStore() {
  try {
    return r2Store()
  } catch {
    return null
  }
}

let defaults: NotifyDeps | undefined

function defaultDeps(): NotifyDeps {
  if (defaults) return defaults
  const env = serverEnv()
  const { config, problem } = feishuConfig(env)
  if (problem) logger.warn('owner alerts are off', { problem })
  defaults = {
    config,
    db: createAdminSupabase,
    dedupe: createDedupe(markerStore),
    feishu: { fetch: (input, init) => fetch(input, init), now: Date.now },
    origin: appOrigin,
    testSite: env.VERCEL_ENV !== 'production',
  }
  return defaults
}

function safely(run: (deps: NotifyDeps) => Promise<void>): Promise<void> {
  try {
    return run(defaultDeps()).catch((error: unknown) => logger.warn('owner alert crashed', { error }))
  } catch (error) {
    logger.warn('owner alert setup failed', { error })
    return Promise.resolve()
  }
}

export function notifyOwner(alert: OwnerAlert): Promise<void> {
  return safely((deps) => notifyOwnerWith(deps, alert))
}

export function noteGenerationFailure(): Promise<void> {
  return safely((deps) => noteGenerationFailureWith(deps))
}
