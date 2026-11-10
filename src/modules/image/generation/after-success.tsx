'use client'

import type { ReactNode } from 'react'

import type { TrackedJob } from './job-model'
import { useJobs } from './use-jobs'

export const anySucceeded = (jobs: readonly TrackedJob[]) => jobs.some((job) => job.status === 'succeeded')

// Renders its children once a photo has come out in this tab (the job store survives page
// changes and reloads). The shell puts the wishlist's one-time hint inside: a succeeded photo is
// what lets an account post (ARCHITECTURE §15.1). Core and modules cannot import each other, so
// the slot is how the two meet.
export function AfterSuccess({ children }: { children: ReactNode }) {
  return anySucceeded(useJobs()) ? children : null
}
