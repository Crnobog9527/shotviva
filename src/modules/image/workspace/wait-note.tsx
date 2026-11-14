'use client'

import { useTranslations } from 'next-intl'

import { getQueueLimit } from '../generation/job-store'
import type { TrackedJob } from '../generation/job-model'
import { isLate, queueSpot, roundedSeconds } from '../generation/eta'
import { useEta } from '../generation/eta-store'
import { useJobs } from '../generation/use-jobs'
import { useNow } from './use-now'

// Up to 90 s in seconds, past that in whole minutes.
export function durationValues(ms: number): { seconds: number } | { minutes: number } {
  return ms < 90_000 ? { seconds: roundedSeconds(ms) } : { minutes: Math.max(2, Math.round(ms / 60_000)) }
}

// Under the developing steps (DESIGN §4.4): how long this usually takes, from real recent jobs;
// "taking longer than usual" once it is well past that; for a queued photo how many go first
// and when its turn comes. No estimate yet (or too few jobs to say): the generic line.
export function WaitNote({ job }: { job: TrackedJob }) {
  const t = useTranslations('app')
  const now = useNow()
  const eta = useEta(job)
  const jobs = useJobs()
  const spot = queueSpot(jobs, job, getQueueLimit(), eta)
  let lead: string | null = null
  if (spot) {
    const wait = spot.waitMs ? durationValues(spot.waitMs) : null
    const starts = wait ? t('seconds' in wait ? 'wait.startsIn' : 'wait.startsInMinutes', wait) : null
    lead = [t('wait.ahead', { ahead: spot.ahead }), starts].filter(Boolean).join(' ')
  } else if (eta && job.startedAt) {
    const usual = durationValues(eta.p50Ms)
    lead = isLate(now - job.startedAt, eta) ? t('wait.late') : t('seconds' in usual ? 'wait.usual' : 'wait.usualMinutes', usual)
  }
  return (
    <p aria-live="polite" className="mt-4 text-caption text-bone-dim">
      {lead ? `${lead} ${t('wait.leave')}` : t('workspace.leave')}
    </p>
  )
}
