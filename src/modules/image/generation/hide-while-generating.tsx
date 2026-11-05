'use client'

import type { ReactNode } from 'react'

import { useJobs } from './use-jobs'

// Lets the app layout drop chrome (the announcement banner) while this tab has a generation
// running, without core knowing about image jobs. Shows children during server render and
// hydration, when no job is known yet.
export function HideWhileGenerating({ children }: { children: ReactNode }) {
  const running = useJobs().some((job) => job.status === 'running')
  return running ? null : children
}
