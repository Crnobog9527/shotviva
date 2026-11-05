'use client'

import { useSyncExternalStore } from 'react'

import { getJobs, getServerJobs, subscribe } from './job-store'
import type { TrackedJob } from './job-model'

// Jobs this tab started; empty during server render and hydration.
export function useJobs(): TrackedJob[] {
  return useSyncExternalStore(subscribe, getJobs, getServerJobs)
}

export function useJob(id: string | null): TrackedJob | null {
  const jobs = useJobs()
  return id ? (jobs.find((job) => job.id === id) ?? null) : null
}
