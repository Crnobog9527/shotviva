import 'server-only'

import { after } from 'next/server'

import { logger } from '../logger'
import { publicEnv } from '../public-env'
import { validateEvent, type EventProps, type ServerEventName } from './events'

// Server-side capture (ARCHITECTURE §16.2): signup, generate, checkout_start and purchase go
// straight to PostHog's capture endpoint with the same public project key the browser uses.
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
}

export type TrackContext = { distinctId: string }

export type ServerTrack = <E extends ServerEventName>(event: E, props: EventProps<E>, ctx: TrackContext) => void

// `after` throws outside a request scope (scripts, tests); then the send just runs detached.
function scheduleAfterResponse(task: () => Promise<void>): void {
  try {
    after(task)
  } catch {
    void task()
  }
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
    if (!deps.key) return
    const checked = validateEvent(event, props)
    if (!checked.ok) {
      logger.error('analytics event refused', { event, issues: checked.issues })
      return
    }
    const body = {
      api_key: deps.key,
      event,
      distinct_id: ctx.distinctId,
      properties: { ...checked.props, $lib: 'shotviva-server' },
      timestamp: (deps.now?.() ?? new Date()).toISOString(),
    }
    ;(deps.schedule ?? scheduleAfterResponse)(() => send(deps, body, event))
  }
}

export const track: ServerTrack = createServerTracker({
  key: publicEnv.NEXT_PUBLIC_POSTHOG_KEY,
  host: publicEnv.NEXT_PUBLIC_POSTHOG_HOST,
})
