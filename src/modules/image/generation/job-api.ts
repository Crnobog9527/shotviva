import type { JobView } from '@/core/jobs'
import { retryDelayMs } from '@/core/retry-after'

import type { ErrorBodyLike } from './job-model'

export type GenerateBody = {
  expected_credits?: number
  template_id: string
  input_key: string | null
  // A slot template's uploads by slot (§5.1e); such a job has no input_key.
  input_slots?: Record<string, string>
  // Photos in the workspace batch (T28); 1 for a single photo.
  batch_size?: number
  // From the batch preflight (T107): the batch, its distinct templates and this cell's signed proof.
  batch_id?: string
  batch_templates?: number
  batch_cell?: { position: number; photo_name: string; template_name: string; signature: string }
  inputs: { copy: Record<string, string>; aspect_ratio: string; resolution: string; note?: string; toggles?: Record<string, boolean>; toggles_confirmed?: string[] }
  // A dense-text poster (ARCHITECTURE §5.3): which poster of the saved set this job makes.
  poster?: { set_id: string; part: number; redraw_of?: string }
  // Make again from one of the user's own works (T40): that work's id (ARCHITECTURE §16.2c).
  again_of?: string
  // 出图时让员工自选 (§6.5): which kind of org credits pays (only when the member holds both).
  pool_choice?: 'paid' | 'promo'
}

// A photo edit (ARCHITECTURE §5.2): goes to /api/edit, settles and polls like any job.
export type EditBody = { expected_credits?: number; source_job_id: string; instruction: string; resolution: string; aspect_ratio?: string; batch_size?: number }

export type JobBody = GenerateBody | EditBody

const isEdit = (body: JobBody): body is EditBody => 'source_job_id' in body

// 'limited': any 429, the app's RATE_LIMITED or the Vercel firewall's own (whose body carries no
// code of ours). Never a failure: the job waits retryAfterMs and goes out again (plan §5).
export type SubmitOutcome =
  | { kind: 'view'; view: JobView }
  | { kind: 'error'; body: ErrorBodyLike }
  // settled: the job was created and refunded (the provider stayed at its limit, Q3), so its id is
  // spent and the photo goes out again under a new one.
  | { kind: 'limited'; retryAfterMs: number; settled?: boolean }
  | { kind: 'lost' }

// POST /api/generate with a client-made job id, so a retried or backgrounded request finds the
// same job instead of charging twice. A network drop (iOS suspending the tab) is "lost": the
// server job carries on and polling picks the result up.
export async function submitJob(jobId: string, body: JobBody): Promise<SubmitOutcome> {
  try {
    const response = await fetch(isEdit(body) ? '/api/edit' : '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, job_id: jobId }),
    })
    if (response.status === 429) {
      const limited = (await response.json().catch(() => ({}))) as { job_id?: unknown }
      return { kind: 'limited', retryAfterMs: retryDelayMs(response.headers.get('Retry-After')), ...(typeof limited.job_id === 'string' ? { settled: true } : {}) }
    }
    const json: unknown = await response.json().catch(() => ({}))
    if (response.ok) return { kind: 'view', view: json as JobView }
    return { kind: 'error', body: json as ErrorBodyLike }
  } catch {
    return { kind: 'lost' }
  }
}

// GET /api/generate/{id}. 'missing' means the server never created the job (the POST died
// before credits were reserved); null is a transient failure the poller retries.
export async function readJob(jobId: string): Promise<JobView | 'missing' | null> {
  try {
    const response = await fetch(`/api/generate/${jobId}`, { cache: 'no-store' })
    if (response.status === 404) return 'missing'
    return response.ok ? ((await response.json()) as JobView) : null
  } catch {
    return null
  }
}

// The status of several jobs in one request (GET /api/generate/status), so a batch polls once
// per pass instead of once per photo. Each id maps to its view or 'missing' (the server never
// created it); null for the whole pass is a transient failure the poller retries.
export const STATUS_IDS_MAX = 50

export async function readJobs(jobIds: readonly string[]): Promise<Map<string, JobView | 'missing'> | null> {
  const result = new Map<string, JobView | 'missing'>()
  for (let start = 0; start < jobIds.length; start += STATUS_IDS_MAX) {
    const ids = jobIds.slice(start, start + STATUS_IDS_MAX)
    try {
      const response = await fetch(`/api/generate/status?ids=${ids.join(',')}`, { cache: 'no-store' })
      if (!response.ok) return null
      const body = (await response.json()) as { jobs?: JobView[] }
      const found = new Map((body.jobs ?? []).map((view) => [view.id, view]))
      ids.forEach((id) => result.set(id, found.get(id) ?? 'missing'))
    } catch {
      return null
    }
  }
  return result
}
