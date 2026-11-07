import type { ObjectStore } from '../storage/object-store'
import { logger } from '../logger'

// Owner alerts go out once per fact (ARCHITECTURE §16.4). Stripe redelivers a failed event for up
// to three days and every attempt can land on a different function instance, so the mark must
// be shared and atomic: one tiny object per key in the environment's private R2 bucket, written
// with If-None-Match: * (R2 evaluates it atomically). No table, no migration, a fraction of a
// cent a year at alert volumes. A per-instance memory in front saves the R2 call for repeats.
// If R2 cannot be reached the alert still goes out: a duplicate beats a missed refund.

export const MARKER_PREFIX = 'ops/alerts/'
const MEMORY_LIMIT = 500

export type MarkerStore = Pick<ObjectStore, 'putIfAbsent' | 'delete'>

export type Dedupe = {
  // true: this caller owns the key and should send.
  claim(key: string): Promise<boolean>
  // Already claimed in this instance (no network): lets the failure-rate check skip its query.
  seen(key: string): boolean
  // The send failed: free the key so a redelivery can try again.
  release(key: string): Promise<void>
}

export function markerKey(key: string): string {
  return `${MARKER_PREFIX}${key.replace(/[^A-Za-z0-9._:-]/g, '_')}`
}

export function createDedupe(store: () => MarkerStore | null, now: () => Date = () => new Date()): Dedupe {
  const memory = new Set<string>()
  const remember = (key: string) => {
    memory.add(key)
    // Sets iterate in insertion order: drop the oldest.
    if (memory.size > MEMORY_LIMIT) memory.delete(memory.values().next().value as string)
  }
  return {
    seen: (key) => memory.has(key),
    async claim(key) {
      if (memory.has(key)) return false
      remember(key)
      const markers = store()
      if (!markers) return true
      try {
        return await markers.putIfAbsent(markerKey(key), new TextEncoder().encode(now().toISOString()), 'text/plain')
      } catch (error) {
        logger.warn('owner alert dedupe unavailable; sending anyway', { key, error })
        return true
      }
    },
    async release(key) {
      memory.delete(key)
      try {
        await store()?.delete(markerKey(key))
      } catch (error) {
        logger.warn('owner alert marker not released', { key, error })
      }
    },
  }
}
