'use client'

import { useSyncExternalStore } from 'react'

import { getJobs, getServerJobs, getServerWorkspaceJobs, getWorkspaceJobs, subscribe } from './job-store'
import type { TrackedJob } from './job-model'

// Jobs this tab started; empty during server render and hydration.
export function useJobs(): TrackedJob[] {
  return useSyncExternalStore(subscribe, getJobs, getServerJobs)
}

export function useJob(id: string | null): TrackedJob | null {
  const jobs = useJobs()
  return id ? (jobs.find((job) => job.id === id) ?? null) : null
}

// The jobs this template's workspace is showing, restored after a refresh; empty during server
// render and hydration, then the form gives way to the developing view or result.
export function useWorkspaceJobs(templateId: string): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => getWorkspaceJobs(templateId),
    getServerWorkspaceJobs,
  )
}
