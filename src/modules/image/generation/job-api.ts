import type { JobView } from '@/core/jobs'

import type { ErrorBodyLike } from './job-model'

export type GenerateBody = {
  expected_credits?: number
  template_id: string
  input_key: string | null
  // Photos in the workspace batch (T28); 1 for a single photo.
  batch_size?: number
  // From the batch preflight (T107): the batch, its distinct templates and this cell's signed proof.
  batch_id?: string
  batch_templates?: number
  batch_cell?: { position: number; photo_name: string; template_name: string; signature: string }
  inputs: { copy: Record<string, string>; aspect_ratio: string; resolution: string; note?: string; toggles?: Record<string, boolean>; toggles_confirmed?: string[] }
  // A dense-text poster (ARCHITECTURE §5.3): which poster of the saved set this job makes.
  poster?: { set_id: string; part: number; redraw_of?: string }
}

// A photo edit (ARCHITECTURE §5.2): goes to /api/edit, settles and polls like any job.
export type EditBody = { expected_credits?: number; source_job_id: string; instruction: string; resolution: string; aspect_ratio?: string; batch_size?: number }

export type JobBody = GenerateBody | EditBody

const isEdit = (body: JobBody): body is EditBody => 'source_job_id' in body

export type SubmitOutcome = { kind: 'view'; view: JobView } | { kind: 'error'; body: ErrorBodyLike } | { kind: 'lost' }

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
