'use client'

import type { ReactNode } from 'react'

import { isActive } from './scheduler'
import { useJobs } from './use-jobs'

// Lets the app layout drop chrome (the announcement banner) while this tab has a generation
// running, without core knowing about image jobs. Shows children during server render and
// hydration, when no job is known yet.
export function HideWhileGenerating({ children }: { children: ReactNode }) {
  const running = useJobs().some(isActive)
  return running ? null : children
}
