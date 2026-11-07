import type { ServerErrorSignal } from '../analytics/server-errors'
import type { ErrorArea, SiteErrorsAlert } from './alert-kinds'

// 「网站报错异常」 (ARCHITECTURE §16.4, Owner 2026-11-08: Feishu replaces Sentry's alert emails).
// Sentry keeps collecting every error; this only counts them on their way there and alerts when
// the last 10 minutes are unusual: ≥ 10 server errors in all, or ≥ 3 in payments or sign-in.
// Counting is in memory, per function instance, in a 10-minute window: no table, no extra
// request, nothing on the healthy path. At Shotviva's traffic Vercel Fluid compute serves the
// site from one or a few instances per region, and a real outage fails on every instance, so
// each one crosses the line on its own; the R2 dedupe mark (key = the half hour) lets exactly one
// message out per 30 minutes however many instances do. What a per-instance count can miss is a
// slow trickle spread thinly over many instances; Sentry still records those.

export const SITE_ERROR_RULE = { windowMinutes: 10, minTotal: 10, minCritical: 3, quietMinutes: 30 } as const

const CRITICAL: readonly ErrorArea[] = ['payment', 'auth']

// Matched in order against a request path or an API route name ('webhooks/stripe', 'checkout').
const PATH_AREAS: readonly [RegExp, ErrorArea][] = [
  [/webhooks|checkout|billing|portal|subscription/, 'payment'],
  [/(^|\/)(auth|login|signup|reset)(\/|$)|sms-hook/, 'auth'],
  [/(^|\/)admin(\/|$)/, 'admin'],
  [/generate|edit|files|uploads|partner|photos/, 'generate'],
]

export function pathArea(path: string): ErrorArea {
  const lower = path.toLowerCase()
  return PATH_AREAS.find(([pattern]) => pattern.test(lower))?.[1] ?? 'site'
}

// null: not counted. Generation failures have their own failure-rate alert; warnings (the alert
// sender's own failures among them) are not errors, and counting them could loop.
export function areaOf(signal: ServerErrorSignal): ErrorArea | null {
  if (signal.source === 'request') return pathArea(signal.path)
  if (signal.source === 'api') return pathArea(signal.route)
  if (signal.level === 'warning' || signal.alert === 'generation_failed') return null
  if (signal.alert === 'payment_webhook_failed') return 'payment'
  if (signal.alert === 'credit_refund_failed') return 'generate'
  return 'site'
}

export type ErrorBreach = Pick<SiteErrorsAlert, 'total' | 'byArea' | 'since' | 'trigger'>

function breachOf(events: readonly { at: number; area: ErrorArea }[]): ErrorBreach | null {
  const byArea: Partial<Record<ErrorArea, number>> = {}
  for (const { area } of events) byArea[area] = (byArea[area] ?? 0) + 1
  const critical = CRITICAL.find((area) => (byArea[area] ?? 0) >= SITE_ERROR_RULE.minCritical)
  if (!critical && events.length < SITE_ERROR_RULE.minTotal) return null
  const first = events[0]
  return { total: events.length, byArea, since: new Date(first ? first.at : Date.now()).toISOString(), trigger: critical ?? 'total' }
}

const EVENT_LIMIT = 1000

export type ErrorWindow = { record(area: ErrorArea, nowMs: number): ErrorBreach | null }

export function createErrorWindow(): ErrorWindow {
  const events: { at: number; area: ErrorArea }[] = []
  return {
    record(area, nowMs) {
      events.push({ at: nowMs, area })
      const oldest = nowMs - SITE_ERROR_RULE.windowMinutes * 60_000
      while (events.length > 0 && ((events[0]?.at ?? nowMs) < oldest || events.length > EVENT_LIMIT)) events.shift()
      return breachOf(events)
    },
  }
}

// The half hour a breach falls in (UTC): the dedupe key, so at most one message per 30 minutes.
export function errorSlot(now: Date): string {
  const minutes = now.getUTCMinutes() < SITE_ERROR_RULE.quietMinutes ? '00' : '30'
  return `${now.toISOString().slice(0, 13)}:${minutes}`
}

export function siteErrorsAlert(breach: ErrorBreach, now: Date, sentryUrl: string): SiteErrorsAlert {
  return { kind: 'site_errors', ...breach, windowMinutes: SITE_ERROR_RULE.windowMinutes, slot: errorSlot(now), sentryUrl }
}

// The Sentry issue list for this environment, last hour.
export function sentryIssuesUrl(org: string | undefined, environment: string): string {
  const query = `?environment=${encodeURIComponent(environment)}&statsPeriod=1h`
  return org ? `https://${org}.sentry.io/issues/${query}` : `https://sentry.io/issues/${query}`
}
