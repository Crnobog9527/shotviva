'use client'

import { readJob, submitJob, type GenerateBody, type SubmitOutcome } from './job-api'
import { applyError, applyView, type TrackedJob } from './job-model'
import { markSent, nextToSend, requeue } from './scheduler'
import { loadState, saveState, type WorkspaceViews } from './store-persistence'

// Module-level store, so a generation outlives the page that started it: navigating from the
// workspace to Photos keeps the requests (and this list) alive. Survives a reload through
// sessionStorage; the server row in generation_jobs stays the truth (Photos reads it).
// A batch waits here as 'queued' and goes out at most `limit` at a time (scheduler.ts).
const EMPTY: TrackedJob[] = []
const NO_IDS: readonly string[] = []
// A job the server never saw (404) is given up after this long; its POST died pre-reserve.
const MISSING_GRACE_MS = 30_000

let jobs: TrackedJob[] = EMPTY
// The account's concurrency (TIER_LIMITS), handed over by the workspace; persisted with the
// jobs so a reload on another page keeps the same pace.
let limit = 1
// The jobs each workspace (by template id) is showing, so a refresh there lands on the same
// developing view or result instead of an empty form.
let views: WorkspaceViews = {}
let restored = false
const listeners = new Set<() => void>()

function set(next: TrackedJob[], nextViews: WorkspaceViews = views) {
  jobs = next
  views = nextViews
  saveState({ limit, jobs, views })
  listeners.forEach((listener) => listener())
}

function update(id: string, change: (job: TrackedJob) => TrackedJob) {
  set(jobs.map((job) => (job.id === id ? change(job) : job)))
}

export function getJobs(): TrackedJob[] {
  if (!restored && typeof window !== 'undefined') {
    restored = true
    const back = loadState(Date.now())
    if (back.jobs.length) {
      jobs = back.jobs
      limit = back.limit
      views = back.views
      // Jobs that were in flight before the reload are queued again; send them once the
      // store is read (a microtask, so React is not updated mid-render).
      queueMicrotask(pump)
    }
  }
  return jobs
}

export const getServerJobs = () => EMPTY

// The jobs a template's workspace shows (empty: the form). Stable references, for
// useSyncExternalStore.
export function getWorkspaceJobs(templateId: string): readonly string[] {
  getJobs()
  return views[templateId] ?? NO_IDS
}

export const getServerWorkspaceJobs = () => NO_IDS

export function setWorkspaceJobs(templateId: string, ids: readonly string[]) {
  const rest = Object.fromEntries(Object.entries(views).filter(([key]) => key !== templateId))
  set(getJobs(), ids.length ? { ...rest, [templateId]: [...ids] } : rest)
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type StartInput = Pick<TrackedJob, 'templateId' | 'templateName' | 'resolution' | 'aspect' | 'credits' | 'inputKey'> & {
  previewUrl?: string
  body: GenerateBody
}

function queued(input: StartInput, batchSize: number, queuedAt: number): TrackedJob {
  const id = crypto.randomUUID()
  const body = { ...input.body, batch_size: batchSize }
  return { ...input, id, body, batchSize, queuedAt, startedAt: 0, sentAt: undefined, status: 'queued', fileUrl: null, creditPool: null, failure: null }
}

// Queues one job per photo, in the order given, and starts as many as the limit allows.
// Returns the client-made job ids (the server keys idempotency on them).
export function enqueueJobs(inputs: readonly StartInput[], concurrency: number): string[] {
  limit = Math.max(1, concurrency)
  const now = Date.now()
  // queuedAt + index keeps the batch's own order for the scheduler.
  const added = inputs.map((input, index) => queued(input, inputs.length, now + index))
  set([...added.slice().reverse(), ...getJobs()])
  pump()
  return added.map((job) => job.id)
}

export function startJob(input: StartInput, concurrency: number): string {
  return enqueueJobs([input], concurrency)[0] as string
}

// Retry from a failed row: a new job (new id, charged on its own) with the same photo and
// settings, in the failed one's place.
export function retryJob(id: string, concurrency: number): string | null {
  const failed = getJobs().find((job) => job.id === id)
  if (!failed?.body || failed.status !== 'failed') return null
  limit = Math.max(1, concurrency)
  const next = queued({ ...failed, body: failed.body }, failed.batchSize, Date.now())
  // The workspace showing the failed photo shows its retry in the same place.
  const swapped = Object.fromEntries(Object.entries(views).map(([key, ids]) => [key, ids.map((current) => (current === id ? next.id : current))]))
  set(
    getJobs().map((job) => (job.id === id ? next : job)),
    swapped,
  )
  pump()
  return next.id
}

function applyOutcome(job: TrackedJob, outcome: SubmitOutcome): TrackedJob {
  // Polling may have settled it first; the first answer stands.
  if (job.status !== 'running') return job
  if (outcome.kind === 'view') return applyView(job, outcome.view)
  if (outcome.kind === 'error' && outcome.body.code === 'RATE_LIMITED') return requeue(job, Date.now())
  if (outcome.kind === 'error') return applyError(job, outcome.body)
  // 'lost': the server job may well carry on; polling picks it up.
  return job
}

function settle(id: string, outcome: SubmitOutcome) {
  update(id, (current) => applyOutcome(current, outcome))
  pump()
}

// Sends every queued job the limit has room for. Safe to call any time; it is a no-op when
// nothing is due.
export function pump() {
  const now = Date.now()
  for (const id of nextToSend(getJobs(), limit, now)) {
    const job = jobs.find((candidate) => candidate.id === id)
    if (!job?.body) continue
    const { body } = job
    update(id, (current) => markSent(current, now))
    void submitJob(id, body).then((outcome) => settle(id, outcome))
  }
}

// One polling pass over every running job (GenerationRunner calls it every few seconds), then
// a pump for queued jobs whose rate-limit wait is over.
export async function pollRunning(): Promise<void> {
  const running = getJobs().filter((job) => job.status === 'running')
  await Promise.all(
    running.map(async (job) => {
      const view = await readJob(job.id)
      if (view === 'missing') {
        if (Date.now() - (job.sentAt ?? job.startedAt) > MISSING_GRACE_MS) update(job.id, (current) => applyError(current, { code: 'INTERNAL' }))
      } else if (view) {
        update(job.id, (current) => (current.status === 'running' ? applyView(current, view) : current))
      }
    }),
  )
  pump()
}

export function forgetJob(id: string) {
  set(getJobs().filter((job) => job.id !== id))
}
