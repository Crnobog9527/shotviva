'use client'

import { restore, serialize, type TrackedJob } from './job-model'

// sessionStorage for the generation store: this tab only, unsettled jobs only (job-model.ts
// decides which survive). Before T28 the value was the bare job array; it still reads.
const KEY = 'shotviva.generations'

export type StoreState = { limit: number; jobs: TrackedJob[] }

export function saveState(state: StoreState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ limit: state.limit, jobs: JSON.parse(serialize(state.jobs)) as unknown }))
  } catch {
    // Private mode or quota: the jobs still land in Photos, only the in-tab list is lost.
  }
}

export function loadState(now: number): StoreState {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) return { limit: 1, jobs: restore(raw, now) }
    if (parsed && typeof parsed === 'object' && 'jobs' in parsed) {
      const { limit, jobs } = parsed as { limit?: unknown; jobs?: unknown }
      return { limit: typeof limit === 'number' && limit >= 1 ? limit : 1, jobs: restore(JSON.stringify(jobs), now) }
    }
  } catch {
    // sessionStorage unavailable or unreadable
  }
  return { limit: 1, jobs: [] }
}
