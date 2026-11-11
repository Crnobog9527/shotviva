'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { readJob } from '../generation/job-api'
import type { TrackedJob } from '../generation/job-model'
import { isActive } from '../generation/scheduler'
import { useJobs } from '../generation/use-jobs'
import type { PhotoItem } from './photo-item'

export type RunningRow = PhotoItem & { previewUrl?: string; startedAt: number; queued?: boolean }

const POLL_MS = 3000

const fromTracked = (job: TrackedJob, cover: string | null): RunningRow => ({
  id: job.id,
  templateId: job.templateId,
  templateName: job.templateName,
  batchId: job.batchId ?? null,
  // Running rows are not grouped; only finished ones are.
  batchPosition: null,
  cover,
  aspect: job.aspect,
  resolution: job.resolution,
  credits: job.credits,
  createdAt: new Date(job.startedAt || job.queuedAt).toISOString(),
  creditPool: job.creditPool ?? 'free',
  visibility: 'public',
  fileUrl: null,
  previewUrl: job.previewUrl,
  startedAt: job.startedAt,
  queued: job.status === 'queued',
})

// In progress = what the server had running at render, plus this tab's own jobs it may not
// have seen yet, minus any this tab already watched settle. Server-only rows are polled here
// (the store polls its own); a settled one refreshes the page so it moves into Done.
export function useRunningItems(server: PhotoItem[], covers: Record<string, string | null>): RunningRow[] {
  const jobs = useJobs()
  const router = useRouter()
  const tracked = new Map(jobs.map((job) => [job.id, job]))
  const rows: RunningRow[] = server
    .filter((item) => tracked.get(item.id)?.status !== 'succeeded' && tracked.get(item.id)?.status !== 'failed')
    .map((item) => ({ ...item, previewUrl: tracked.get(item.id)?.previewUrl, startedAt: Date.parse(item.createdAt) }))
  const known = new Set(server.map((item) => item.id))
  // Queued batch photos (T28) show here too, waiting for a slot.
  jobs.filter((job) => isActive(job) && !known.has(job.id)).forEach((job) => rows.unshift(fromTracked(job, covers[job.templateId] ?? null)))

  const untracked = server.filter((item) => !tracked.has(item.id)).map((item) => item.id).join(',')
  useEffect(() => {
    if (!untracked) return
    const timer = setInterval(async () => {
      const views = await Promise.all(untracked.split(',').map(readJob))
      if (views.some((view) => view === 'missing' || (view !== null && view.status !== 'running'))) router.refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [untracked, router])
  return rows
}
