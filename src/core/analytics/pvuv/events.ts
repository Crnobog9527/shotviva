import { pvuvProps, type PvuvProps } from './props'

// Server events to PVUV.ai (https://api.pvuv.ai/docs/server-events.md): the dictionary's
// server events (signup, generate, checkout_start, purchase…) as PVUV goal events, sent after the
// response with the ingest-only token. Same names and properties as PostHog got, plus `locale`.
// `purchase` carries its USD amount as PVUV revenue and nothing else about money.

const SEND_TIMEOUT_MS = 3_000

export type PvuvEventConfig = { site: string; token: string }
type Fetch = (input: string, init: RequestInit) => Promise<unknown>

export type PvuvServerEvent = {
  name: string
  user_id: string
  visitor_id?: string
  revenue?: number
  currency?: string
  props: PvuvProps
  id?: string
  ts: number
}

// `visitorId` is the browser's _pv_id cookie when the request that caused the event carried one
// (it exists only where the visitor's cookies are allowed); webhooks and jobs have none and are
// linked by `user_id`, the id the page passes to pvuv('identify').
export function pvuvServerEvent(
  name: string,
  props: Record<string, unknown>,
  ctx: { userId: string; locale: string; visitorId?: string | undefined; eventId?: string | undefined },
  now: number,
): PvuvServerEvent {
  const event: PvuvServerEvent = { name, user_id: ctx.userId, props: pvuvProps(props, { locale: ctx.locale }), ts: now }
  if (ctx.visitorId) event.visitor_id = ctx.visitorId
  // PVUV ignores a repeated id (8–64 chars of [A-Za-z0-9_-]): revenue cannot count twice on a retry.
  const id = ctx.eventId ? `${name}-${ctx.eventId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) : ''
  if (id.length >= 8) event.id = id
  // Revenue is the amount alone; amount_usd and the discount stay out of props.
  if (name === 'purchase' && typeof props.amount_usd === 'number') {
    event.revenue = props.amount_usd
    event.currency = 'USD'
    delete event.props.amount_usd
    delete event.props.amount_discount_usd
  }
  return event
}

// Never throws.
export async function sendPvuvEvent(config: PvuvEventConfig, event: PvuvServerEvent, doFetch: Fetch = fetch): Promise<void> {
  try {
    await doFetch(`https://api.pvuv.ai/v1/sites/${config.site}/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
  } catch {
    // Analytics must never fail the request.
  }
}
