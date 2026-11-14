'use client'

import { useLocale, useTranslations } from 'next-intl'

import { getQueueLimit } from '../generation/job-store'
import type { TrackedJob } from '../generation/job-model'
import { isLate, queueSpot, roundedSeconds, type Eta, type QueueSpot } from '../generation/eta'
import { useEta } from '../generation/eta-store'
import { useJobs } from '../generation/use-jobs'
import { useNow } from './use-now'

// Up to 90 s in seconds, past that in whole minutes.
export function durationValues(ms: number): { seconds: number } | { minutes: number } {
  return ms < 90_000 ? { seconds: roundedSeconds(ms) } : { minutes: Math.max(2, Math.round(ms / 60_000)) }
}

type T = ReturnType<typeof useTranslations<'app'>>

// The first sentence: place in line and when its turn comes, or the usual time, or "longer
// than usual"; null when there is no estimate to go by.
function leadLine(t: T, gap: string, job: TrackedJob, spot: QueueSpot | null, eta: Eta | null, now: number): string | null {
  if (spot) {
    const wait = spot.waitMs ? durationValues(spot.waitMs) : null
    const starts = wait ? t('seconds' in wait ? 'wait.startsIn' : 'wait.startsInMinutes', wait) : null
    return [t('wait.ahead', { ahead: spot.ahead }), starts].filter(Boolean).join(gap)
  }
  if (!eta || !job.startedAt) return null
  const usual = durationValues(eta.p50Ms)
  return isLate(now - job.startedAt, eta) ? t('wait.late') : t('seconds' in usual ? 'wait.usual' : 'wait.usualMinutes', usual)
}

// Under the developing steps (DESIGN §4.4): how long this usually takes, from real recent jobs;
// "taking longer than usual" once it is well past that; for a queued photo how many go first
// and when its turn comes. No estimate yet (or too few jobs to say): the generic line.
export function WaitNote({ job }: { job: TrackedJob }) {
  const t = useTranslations('app')
  // Sentences run on with a space in English, with none in Chinese.
  const gap = useLocale() === 'zh' ? '' : ' '
  const now = useNow()
  const eta = useEta(job)
  const spot = queueSpot(useJobs(), job, getQueueLimit(), eta)
  const lead = leadLine(t, gap, job, spot, eta, now)
  return (
    <p aria-live="polite" className="mt-4 text-caption text-bone-dim">
      {lead ? `${lead}${gap}${t('wait.leave')}` : t('workspace.leave')}
    </p>
  )
}
