'use client'

import { restore, serialize, type TrackedJob } from './job-model'

// sessionStorage for the generation store: this tab only. It holds the unsettled jobs, the
// account's pace (`limit`), and which jobs each workspace is showing (`views`, by template id),
// plus those settled jobs, so a refresh in the workspace comes back to the same developing
// view or result (job-model.ts decides what survives). Before T28 the value was the bare job
// array; it still reads. `owner` is the signed-in account that wrote it: a tab that signs in as
// someone else must not show (or resend) the last account's batch (job-store claimStore).
const KEY = 'shotviva.generations'

export type WorkspaceViews = Record<string, readonly string[]>
export type StoreState = { limit: number; jobs: TrackedJob[]; views: WorkspaceViews; owner?: string }

const EMPTY_STATE: StoreState = { limit: 1, jobs: [], views: {} }

export function encodeState(state: StoreState): string {
  const keep = new Set(Object.values(state.views).flat())
  return JSON.stringify({ limit: state.limit, jobs: JSON.parse(serialize(state.jobs, keep)) as unknown, views: state.views, owner: state.owner })
}

// A view keeps only the jobs that came back; one left with none is dropped (the form shows).
function pruneViews(raw: unknown, jobs: readonly TrackedJob[]): WorkspaceViews {
  if (!raw || typeof raw !== 'object') return {}
  const known = new Set(jobs.map((job) => job.id))
  const views: Record<string, string[]> = {}
  for (const [templateId, ids] of Object.entries(raw as Record<string, unknown>)) {
    const kept = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && known.has(id)) : []
    if (kept.length) views[templateId] = kept
  }
  return views
}

export function decodeState(raw: string | null, now: number): StoreState {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) return { ...EMPTY_STATE, jobs: restore(raw, now) }
    if (parsed && typeof parsed === 'object' && 'jobs' in parsed) {
      const { limit, jobs: rawJobs, views, owner } = parsed as { limit?: unknown; jobs?: unknown; views?: unknown; owner?: unknown }
      const jobs = restore(JSON.stringify(rawJobs), now)
      // No owner (written before the field): nobody's, so whoever signs in drops it.
      return { limit: typeof limit === 'number' && limit >= 1 ? limit : 1, jobs, views: pruneViews(views, jobs), owner: typeof owner === 'string' ? owner : '' }
    }
  } catch {
    // unreadable: start empty
  }
  return EMPTY_STATE
}

export function saveState(state: StoreState) {
  try {
    sessionStorage.setItem(KEY, encodeState(state))
  } catch {
    // Private mode or quota: the jobs still land in Photos, only the in-tab list is lost.
  }
}

export function loadState(now: number): StoreState {
  try {
    return decodeState(sessionStorage.getItem(KEY), now)
  } catch {
    // sessionStorage unavailable
    return EMPTY_STATE
  }
}
