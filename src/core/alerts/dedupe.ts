import { logger } from '../logger'
import type { MarkerStore } from '../storage/marker-store'
import type { AlertBudget } from './alert-kinds'

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
// Business inquiry alerts per clock hour (T86): the form's own limits are per IP and email, so
// this keeps a spread-out burst from flooding the group. Past it the inquiry is still in the admin.
export const INQUIRY_BUDGET_PER_HOUR = 10

const BUDGETS: Record<AlertBudget, { perHour: number; marker: string }> = {
  tickets: { perHour: TICKET_BUDGET_PER_HOUR, marker: 'ticket_budget' },
  inquiries: { perHour: INQUIRY_BUDGET_PER_HOUR, marker: 'inquiry_budget' },
}

export type Dedupe = {
  // true: this caller owns the key (absent, or older than cooldownMs) and should send.
  claim(key: string, cooldownMs?: number, requireShared?: boolean): Promise<boolean>
  // Held in this instance (no network): lets the checks behind an alert skip their reads.
  held(key: string, cooldownMs?: number): boolean
  // The send definitely failed: free the key so a later event can try again.
  release(key: string): Promise<void>
  // One of the hour's slots of that budget, or false when the hour's budget is used up.
  takeSlot(budget: AlertBudget): Promise<boolean>
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
  // This instance's next slot of each budget in the current hour (slots are claimed in order).
  const cursors: Record<AlertBudget, { hour: string; next: number }> = { tickets: { hour: '', next: 0 }, inquiries: { hour: '', next: 0 } }

  async function markerClaim(key: string, cooldownMs?: number, requireShared = false): Promise<boolean> {
    const markers = store()
    if (!markers) return !requireShared
    try {
      return await markers.claim(markerKey(key), cooldownMs === undefined ? null : new Date(now() - cooldownMs))
    } catch (error) {
      logger.warn('owner alert dedupe unavailable', { key, requireShared, error })
      return !requireShared
    }
  }

  return {
    held: (key, cooldownMs) => memory.held(key, cooldownMs),
    async claim(key, cooldownMs, requireShared) {
      if (memory.held(key, cooldownMs)) return false
      memory.hold(key)
      const claimed = await markerClaim(key, cooldownMs, requireShared)
      if (requireShared && !claimed) memory.drop(key)
      return claimed
    },
    async release(key) {
      memory.drop(key)
      try {
        await store()?.release(markerKey(key))
      } catch (error) {
        logger.warn('owner alert marker not released', { key, error })
      }
    },
    async takeSlot(budget) {
      const { perHour, marker } = BUDGETS[budget]
      const cursor = cursors[budget]
      const hour = new Date(now()).toISOString().slice(0, 13)
      if (cursor.hour !== hour) Object.assign(cursor, { hour, next: 0 })
      while (cursor.next < perHour) {
        const slot = cursor.next
        cursor.next += 1
        if (await markerClaim(`${marker}:${hour}:${slot}`)) return true
      }
      return false
    },
  }
}
