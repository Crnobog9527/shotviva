import 'server-only'

import { after } from 'next/server'

import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { serverEnv } from '../env'
import { publicEnv } from '../public-env'
import { pvuvServerEvent, sendPvuvEvent, type PvuvEventConfig } from './pvuv/events'
import { validateEvent, type EventProps, type ServerEventName } from './events'

// Server-side capture (ARCHITECTURE §16.2): signup, generate, checkout_start and purchase go
// straight to PostHog's capture endpoint with the same public project key the browser uses (only
// while PostHog is switched on), and to PVUV.ai's events endpoint when its server variables are set.
// A plain fetch instead of posthog-node: one awaited request per event, no batching queue
// that a serverless function could freeze before it flushes.

const SEND_TIMEOUT_MS = 3_000

type Fetch = (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>

export type ServerTrackerDeps = {
  key: string
  host: string
  fetch?: Fetch
  // Runs the send without holding the response; defaults to next/server `after`.
  schedule?: (task: () => Promise<void>) => void
  now?: () => Date
  // PVUV.ai (core/analytics/pvuv/events.ts): read per event, null when PVUV_SITE or PVUV_INGEST_TOKEN
  // is unset. PostHog (`key`) and PVUV are independent; either, both or neither may be on.
  pvuv?: () => PvuvEventConfig | null
  // The browser's _pv_id cookie, when the event happens inside its request.
  visitorId?: () => Promise<string | undefined>
}

// `locale` rides on every event (ARCHITECTURE §16.2): the page's language for request-driven
// events, the buyer's checkout language for webhooks.
export type TrackContext = { distinctId: string; locale: Locale }

export type ServerTrack = <E extends ServerEventName>(event: E, props: EventProps<E>, ctx: TrackContext) => void

// `after` throws outside a request scope (scripts, tests); then the send just runs detached.
function scheduleAfterResponse(task: () => Promise<void>): void {
  try {
    after(task)
  } catch {
    void task()
  }
}

function readPvuv(deps: ServerTrackerDeps): PvuvEventConfig | null {
  try {
    return deps.pvuv?.() ?? null
  } catch {
    return null
  }
}

// _pv_id is PVUV's first-party visitor cookie (set by its script, so only where cookies are
// allowed). Outside a request (webhooks, jobs, tests) there is none.
async function requestVisitorId(): Promise<string | undefined> {
  const { cookies } = await import('next/headers')
  return (await cookies()).get('_pv_id')?.value
}

function pvuvFromEnv(): PvuvEventConfig | null {
  const env = serverEnv()
  return env.PVUV_SITE && env.PVUV_INGEST_TOKEN ? { site: env.PVUV_SITE, token: env.PVUV_INGEST_TOKEN } : null
}

async function send(deps: ServerTrackerDeps, body: unknown, event: string): Promise<void> {
  try {
    const response = await (deps.fetch ?? fetch)(new URL('/i/v0/e/', deps.host).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!response.ok) logger.warn('analytics event rejected', { event, status: response.status })
  } catch (error) {
    logger.warn('analytics event not sent', { event, error })
  }
}

// Never throws and never blocks the caller: a dropped event must not fail a sign-in,
// a generation or a payment webhook.
export function createServerTracker(deps: ServerTrackerDeps): ServerTrack {
  return (event, props, ctx) => {
    const pvuv = readPvuv(deps)
    if (!deps.key && !pvuv) return
    const checked = validateEvent(event, props)
    if (!checked.ok) {
      logger.error('analytics event refused', { event, issues: checked.issues })
      return
    }
    const body = {
      api_key: deps.key,
      event,
      distinct_id: ctx.distinctId,
      properties: { ...checked.props, locale: ctx.locale, $lib: 'shotviva-server' },
      timestamp: (deps.now?.() ?? new Date()).toISOString(),
    }
    ;(deps.schedule ?? scheduleAfterResponse)(async () => {
      if (deps.key) await send(deps, body, event)
      if (pvuv) {
        const visitorId = await (deps.visitorId ?? requestVisitorId)().catch(() => undefined)
        const when = (deps.now?.() ?? new Date()).getTime()
        await sendPvuvEvent(pvuv, pvuvServerEvent(event, checked.props, { userId: ctx.distinctId, locale: ctx.locale, visitorId }, when), deps.fetch)
      }
    })
  }
}

export const track: ServerTrack = createServerTracker({
  key: publicEnv.NEXT_PUBLIC_POSTHOG_KEY,
  host: publicEnv.NEXT_PUBLIC_POSTHOG_HOST,
  pvuv: pvuvFromEnv,
})
