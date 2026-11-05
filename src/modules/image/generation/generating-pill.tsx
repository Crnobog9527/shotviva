'use client'

import Link from 'next/link'

import { useJobs } from './use-jobs'

// "Generating…" in the top bar until this tab's jobs settle (DESIGN §4.4), linking to Photos.
export function GeneratingPill() {
  const running = useJobs().filter((job) => job.status === 'running').length
  if (running === 0) return null
  return (
    <Link
      href="/photos"
      aria-live="polite"
      className="press hairline inline-flex h-9 items-center gap-2 rounded-full bg-wash px-3 text-caption leading-none font-medium"
    >
      <span aria-hidden="true" className="animate-dot size-2 rounded-full bg-primary" />
      {running > 1 ? `Generating ${running}…` : 'Generating…'}
    </Link>
  )
}
