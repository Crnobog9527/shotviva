'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { claimStore, pollRunning, pump } from './job-store'
import { isActive } from './scheduler'
import { SettleToast } from './settle-toast'
import { useDocTitle } from './use-doc-title'
import { useJobs } from './use-jobs'

const POLL_MS = 3000

// Mounted once in the app layout: polls running jobs (the POST may have died with a
// backgrounded tab while the server job went on), sends queued batch photos whose wait is over,
// and refreshes server data (balance, Photos) each time one settles. Shows the app-wide notice
// when a photo settles and keeps the tab title on its progress.
export function GenerationRunner() {
  const jobs = useJobs()
  const router = useRouter()
  const running = jobs.filter(isActive).length
  const settled = jobs.length - running
  const seen = useRef(settled)
  const unsent = jobs.some((job) => job.status === 'queued')
  useDocTitle(jobs)
  useUnsentGuard(unsent)

  useEffect(() => {
    if (settled !== seen.current) router.refresh()
    seen.current = settled
  }, [settled, router])

  useEffect(() => {
    if (running === 0) return
    // Not while the tab is out of view (AGENTS §5.1.8): a request still open settles the job
    // when it answers, and coming back polls at once for one the browser dropped. Queued photos
    // whose wait is over still go out (pump sends nothing that is not due).
    const timer = setInterval(() => (document.visibilityState === 'visible' ? void pollRunning() : pump()), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void pollRunning()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running])
  return <SettleToast />
}

// Queued photos are sent from this tab (scheduler.ts): closing it before they go out cancels
// them (nothing is charged). The browser's own "leave site?" asks first; it shows its own words.
function useUnsentGuard(unsent: boolean) {
  useEffect(() => {
    if (!unsent) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsent])
}

// Rendered by the app layout's Identity with the session user's id, so this tab's generation
// store only ever shows that account's jobs (job-store claimStore). A layout effect, before the
// first paint. Lives here, not in its own file, to stay one client module (/account JS budget).
export function GenerationOwner({ userId }: { userId: string }) {
  useLayoutEffect(() => claimStore(userId), [userId])
  return null
}
