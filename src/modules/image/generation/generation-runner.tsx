'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { claimStore, pollRunning } from './job-store'
import { isActive } from './scheduler'
import { useJobs } from './use-jobs'

const POLL_MS = 3000

// Mounted once in the app layout: polls running jobs (the POST may have died with a
// backgrounded tab while the server job went on), sends queued batch photos whose wait is over,
// and refreshes server data (balance, Photos) each time one settles. Renders nothing.
export function GenerationRunner() {
  const jobs = useJobs()
  const router = useRouter()
  const running = jobs.filter(isActive).length
  const settled = jobs.length - running
  const seen = useRef(settled)

  useEffect(() => {
    if (settled !== seen.current) router.refresh()
    seen.current = settled
  }, [settled, router])

  useEffect(() => {
    if (running === 0) return
    const timer = setInterval(() => void pollRunning(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void pollRunning()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running])
  return null
}

// Rendered by the app layout's Identity with the session user's id, so this tab's generation
// store only ever shows that account's jobs (job-store claimStore). A layout effect, before the
// first paint. Lives here, not in its own file, to stay one client module (/account JS budget).
export function GenerationOwner({ userId }: { userId: string }) {
  useLayoutEffect(() => claimStore(userId), [userId])
  return null
}
