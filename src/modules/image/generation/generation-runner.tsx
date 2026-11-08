'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { pollRunning } from './job-store'
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
