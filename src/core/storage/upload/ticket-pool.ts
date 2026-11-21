import { retryDelayMs, sleep } from '../../retry-after'
import type { UploadContentType } from '../rules'

import { requestTicket, TICKET_WAIT_LIMIT_MS } from './request-ticket'

type Ticket = { input_key: string; put_url: string; headers: Record<string, string>; expires_in?: number }
type Held = Ticket & { expiresAt: number; owner: string }

// A batch's upload tickets (queue-fairness plan §5): one POST /api/uploads/batch hands out up to
// ten presigned PUTs, kept here until a photo takes one, instead of one POST /api/uploads per
// photo. Only for compressed photos (image/jpeg, nearly every batch photo); anything else, or a
// batch request that fails, falls back to the single ticket. A ticket closer than 20 s to its
// end is dropped, not used. Tickets belong to the account that asked for them (`owner`, the
// signed-in user id): signing out and in as someone else in the same tab never hands the new
// account a ticket under the old one's inputs/. Without a known account the pool is not used.
// Client-safe.
export const POOL_BATCH_SIZE = 10
const POOLED_TYPE: UploadContentType = 'image/jpeg'
const MIN_LEFT_MS = 20_000

export type PoolDeps = {
  fetch?: typeof fetch
  now?: () => number
  wait?: (ms: number) => Promise<void>
  random?: () => number
  single?: typeof requestTicket
  // The signed-in user id, or undefined while unknown.
  owner?: () => string | undefined
}

export function createTicketPool(deps: PoolDeps = {}) {
  const doFetch = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const now = deps.now ?? Date.now
  const wait = deps.wait ?? sleep
  const random = deps.random ?? Math.random
  const single = deps.single ?? requestTicket
  const ownerOf = deps.owner ?? (() => undefined)
  let held: Held[] = []
  let refill: Promise<void> | null = null

  async function fetchBatch(owner: string, signal?: AbortSignal): Promise<void> {
    const started = now()
    for (;;) {
      const response = await doFetch('/api/uploads/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: POOLED_TYPE, count: POOL_BATCH_SIZE }),
      })
      if (response.status === 429) {
        const delay = retryDelayMs(response.headers.get('Retry-After'), random, now())
        if (now() + delay - started > TICKET_WAIT_LIMIT_MS) return
        await wait(delay, signal)
        continue
      }
      const body = (await response.json().catch(() => null)) as { tickets?: Ticket[] } | null
      if (!response.ok || !Array.isArray(body?.tickets)) return
      const at = now()
      held.push(...body.tickets
        .filter((ticket) => ticket.input_key.startsWith(`inputs/${owner}/`))
        .map((ticket) => ({ ...ticket, owner, expiresAt: at + (ticket.expires_in ?? 60) * 1000 })))
      return
    }
  }

  function take(owner: string): Ticket | null {
    held = held.filter((ticket) => ticket.owner === owner && ticket.expiresAt - now() > MIN_LEFT_MS)
    const ticket = held.shift()
    return ticket ? { input_key: ticket.input_key, put_url: ticket.put_url, headers: ticket.headers } : null
  }

  // Same shape as requestTicket, so it drops into UploadDeps.
  return async function pooledTicket(contentType: UploadContentType, size: number, options: { signal?: AbortSignal } = {}): Promise<Ticket> {
    const owner = ownerOf()
    if (contentType !== POOLED_TYPE || !owner) return single(contentType, size, options)
    let ticket = take(owner)
    if (!ticket) {
      // Photos asking at the same moment share one refill.
      refill ??= fetchBatch(owner, options.signal).catch(() => undefined).finally(() => { refill = null })
      await refill
      if (options.signal?.aborted) throw new DOMException('upload cancelled', 'AbortError')
      ticket = take(owner)
    }
    return ticket ?? single(contentType, size, options)
  }
}
