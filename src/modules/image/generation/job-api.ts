import type { JobView } from '@/core/jobs'

import type { ErrorBodyLike } from './job-model'

export type GenerateBody = {
  template_id: string
  input_key: string | null
  inputs: { copy: Record<string, string>; aspect_ratio: string; resolution: string; note?: string }
  // Photos in the workspace batch (T28); 1 for a single photo.
  batch_size?: number
}

// A photo edit (ARCHITECTURE §5.2): goes to /api/edit, settles and polls like any job.
export type EditBody = { source_job_id: string; instruction: string; resolution: string; batch_size?: number }

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
