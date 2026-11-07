import { logger } from '../logger'
import type { MarkerStore } from '../storage/marker-store'

// Owner alerts go out once per fact, or once per cooldown (ARCHITECTURE §16.4). Stripe redelivers
// a failed event for up to three days and every attempt can land on a different function
// instance, so the mark must be shared and atomic: one tiny object per key in the environment's
// private R2 bucket, claimed with a conditional write (core/storage/marker-store). A cooldown
// slides: the mark's last write is the last send. No table, no migration. A per-instance memory
// in front saves the R2 call for repeats. If R2 cannot be reached the alert still goes out: a
// duplicate beats a missed refund.

export const MARKER_PREFIX = 'ops/alerts/'
const MEMORY_LIMIT = 500

// Ticket alerts (new and replies together) per clock hour, across instances.
export const TICKET_BUDGET_PER_HOUR = 10

export type Dedupe = {
  // true: this caller owns the key (absent, or older than cooldownMs) and should send.
  claim(key: string, cooldownMs?: number): Promise<boolean>
  // Held in this instance (no network): lets the checks behind an alert skip their reads.
  held(key: string, cooldownMs?: number): boolean
  // The send definitely failed: free the key so a later event can try again.
  release(key: string): Promise<void>
  // One of the hour's ticket-alert slots, or false when the hour's budget is used up.
  takeTicketSlot(): Promise<boolean>
}

export function markerKey(key: string): string {
  return `${MARKER_PREFIX}${key.replace(/[^A-Za-z0-9._:-]/g, '_')}`
}

type Clock = () => number

function createMemory(now: Clock) {
  const sentAt = new Map<string, number>()
  return {
    held(key: string, cooldownMs?: number): boolean {
      const at = sentAt.get(key)
      return at !== undefined && (cooldownMs === undefined || now() - at < cooldownMs)
    },
    hold(key: string): void {
      sentAt.delete(key)
      sentAt.set(key, now())
      // Maps iterate in insertion order: drop the oldest.
      if (sentAt.size > MEMORY_LIMIT) sentAt.delete(sentAt.keys().next().value as string)
    },
    drop: (key: string) => sentAt.delete(key),
  }
}

export function createDedupe(store: () => MarkerStore | null, now: Clock = Date.now): Dedupe {
  const memory = createMemory(now)
  // This instance's next ticket slot in the current hour (slots are claimed in order).
  const ticketCursor = { hour: '', next: 0 }

  async function markerClaim(key: string, cooldownMs?: number): Promise<boolean> {
    const markers = store()
    if (!markers) return true
    try {
      return await markers.claim(markerKey(key), cooldownMs === undefined ? null : new Date(now() - cooldownMs))
    } catch (error) {
      logger.warn('owner alert dedupe unavailable; sending anyway', { key, error })
      return true
    }
  }

  return {
    held: (key, cooldownMs) => memory.held(key, cooldownMs),
    async claim(key, cooldownMs) {
      if (memory.held(key, cooldownMs)) return false
      memory.hold(key)
      return markerClaim(key, cooldownMs)
    },
    async release(key) {
      memory.drop(key)
      try {
        await store()?.release(markerKey(key))
      } catch (error) {
        logger.warn('owner alert marker not released', { key, error })
      }
    },
    async takeTicketSlot() {
      const hour = new Date(now()).toISOString().slice(0, 13)
      if (ticketCursor.hour !== hour) Object.assign(ticketCursor, { hour, next: 0 })
      while (ticketCursor.next < TICKET_BUDGET_PER_HOUR) {
        const slot = ticketCursor.next
        ticketCursor.next += 1
        if (await markerClaim(`ticket_budget:${hour}:${slot}`)) return true
      }
      return false
    },
  }
}
