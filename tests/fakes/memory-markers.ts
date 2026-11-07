import type { MarkerStore } from '@/core/storage'

// In-memory MarkerStore with R2's semantics: claim when absent, or when last written at or before
// staleBefore. `now` is the clock the "last written" time comes from.
export function createMemoryMarkers(now: () => number = Date.now) {
  const marks = new Map<string, number>()
  const store: MarkerStore = {
    claim: async (key, staleBefore) => {
      const at = marks.get(key)
      // If-Unmodified-Since passes when the last write is at or before the given time.
      if (at !== undefined && !(staleBefore && at <= staleBefore.getTime())) return false
      marks.set(key, now())
      return true
    },
    release: async (key) => {
      marks.delete(key)
    },
  }
  return { store, marks }
}
