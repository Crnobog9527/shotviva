'use client'

import { readJob, submitJob, type GenerateBody } from './job-api'
import { applyError, applyView, restore, serialize, type TrackedJob } from './job-model'

// Module-level store, so a generation outlives the page that started it: navigating from the
// workspace to Photos keeps the request (and this list) alive. Survives a reload through
// sessionStorage; the server row in generation_jobs stays the truth (Photos reads it).
const KEY = 'shotviva.generations'
const EMPTY: TrackedJob[] = []
// A job the server never saw (404) is given up after this long; its POST died pre-reserve.
const MISSING_GRACE_MS = 30_000

let jobs: TrackedJob[] = EMPTY
let restored = false
const listeners = new Set<() => void>()

function save() {
  try {
    sessionStorage.setItem(KEY, serialize(jobs))
  } catch {
    // Private mode or quota: the job still lands in Photos, only the in-tab list is lost.
  }
}

function set(next: TrackedJob[]) {
  jobs = next
  save()
  listeners.forEach((listener) => listener())
}

function update(id: string, change: (job: TrackedJob) => TrackedJob) {
  set(jobs.map((job) => (job.id === id ? change(job) : job)))
}

export function getJobs(): TrackedJob[] {
  if (!restored && typeof window !== 'undefined') {
    restored = true
    try {
      const back = restore(sessionStorage.getItem(KEY), Date.now())
      if (back.length) jobs = back
    } catch {
      // sessionStorage unavailable
    }
  }
  return jobs
}

export const getServerJobs = () => EMPTY

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type StartInput = Omit<TrackedJob, 'id' | 'startedAt' | 'status' | 'fileUrl' | 'creditPool' | 'failure'> & { body: GenerateBody }

export function startJob({ body, ...meta }: StartInput): string {
  const id = crypto.randomUUID()
  const job: TrackedJob = { ...meta, id, startedAt: Date.now(), status: 'running', fileUrl: null, creditPool: null, failure: null }
  set([job, ...getJobs()])
  void submitJob(id, body).then((outcome) => {
    if (outcome.kind === 'view') update(id, (current) => applyView(current, outcome.view))
    if (outcome.kind === 'error') update(id, (current) => applyError(current, outcome.body))
  })
  return id
}

// One polling pass over every running job (GenerationRunner calls it every few seconds).
export async function pollRunning(): Promise<void> {
  const running = getJobs().filter((job) => job.status === 'running')
  await Promise.all(
    running.map(async (job) => {
      const view = await readJob(job.id)
      if (view === 'missing') {
        if (Date.now() - job.startedAt > MISSING_GRACE_MS) update(job.id, (current) => applyError(current, { code: 'INTERNAL' }))
      } else if (view) {
        update(job.id, (current) => (current.status === 'running' ? applyView(current, view) : current))
      }
    }),
  )
}

export function forgetJob(id: string) {
  set(getJobs().filter((job) => job.id !== id))
}
