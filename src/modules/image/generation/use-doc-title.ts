'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { etaProgress } from './eta'
import { getEta } from './eta-store'
import type { TrackedJob } from './job-model'
import { percent } from './progress'
import { titleCohort, withTitle } from './settle-events'

const TICK_MS = 3000

function prefixFor(jobs: readonly TrackedJob[], count: (done: number, count: number) => string, now: number): string | null {
  const cohort = titleCohort(jobs)
  if (cohort.length === 0) return null
  const [only] = cohort
  if (cohort.length === 1 && only) {
    if (only.status !== 'running') return '…'
    return `${percent(etaProgress(now - only.startedAt, getEta(only.templateId, only.resolution)))}%`
  }
  const done = cohort.filter((job) => job.status === 'succeeded' || job.status === 'failed').length
  return count(done, cohort.length)
}

// The most recently settled job failed (the title says so instead of Ready).
const lastSettledFailed = (jobs: readonly TrackedJob[]) =>
  jobs.reduce<TrackedJob | null>((last, job) => (job.settledAt !== undefined && (!last || job.settledAt > (last.settledAt ?? 0)) ? job : last), null)?.status === 'failed'

// The tab title follows this tab's photos: "42% · …" for one, "2/6 ready · …" for a batch; once
// they settle while the tab is out of view, "✓ Ready · …" (or that one failed) until it is seen.
// Next sets the title on every navigation, so the page's own title is re-read each time ours
// is not the one showing. Ticks only while there is something to show.
export function useDocTitle(jobs: readonly TrackedJob[]) {
  const t = useTranslations('app.notify')
  const base = useRef<string | null>(null)
  const written = useRef<string | null>(null)
  const wasActive = useRef(false)
  const away = useRef<'ready' | 'failed' | null>(null)
  const active = jobs.some((job) => job.status === 'queued' || job.status === 'running')
  const failed = lastSettledFailed(jobs)

  useEffect(() => {
    if (wasActive.current && !active && document.visibilityState === 'hidden') away.current = failed ? 'failed' : 'ready'
    wasActive.current = active
    const apply = () => {
      if (document.title !== written.current) base.current = document.title
      const page = base.current ?? document.title
      const done = away.current === 'ready' ? `✓ ${t('titleReady')}` : away.current === 'failed' ? t('titleFailed') : null
      const next = withTitle(page, active ? prefixFor(jobs, (done, count) => t('titleProgress', { done, count }), Date.now()) : done)
      written.current = next
      if (document.title !== next) document.title = next
    }
    apply()
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !away.current) return
      away.current = null
      apply()
    }
    const timer = active || away.current ? setInterval(apply, TICK_MS) : undefined
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [jobs, active, failed, t])
}
