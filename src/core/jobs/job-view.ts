import type { CreditPool } from '../billing/pools'
import type { Job, JobStatus, JobVisibility } from './job-schema'

// What the browser sees of a job. Never image bytes (AGENTS §6): the result is fetched from
// the download route, which applies the watermark rule.
export type JobView = {
  id: string
  status: JobStatus
  // 'free' works are watermarked and stay public; 'paid' works are clean and may be private.
  credit_pool: CreditPool
  visibility: JobVisibility
  template_id: string
  credits_cost: number
  error_code: string | null
  file_url: string | null
  created_at: string
  finished_at: string | null
}

export const fileUrlFor = (jobId: string) => `/api/files/${jobId}`

export function toJobView(job: Job): JobView {
  return {
    id: job.id,
    status: job.status,
    credit_pool: job.creditPool,
    visibility: job.visibility,
    template_id: job.templateId,
    credits_cost: job.creditsCost,
    error_code: job.errorCode,
    file_url: job.status === 'succeeded' ? fileUrlFor(job.id) : null,
    created_at: job.createdAt.toISOString(),
    finished_at: job.finishedAt?.toISOString() ?? null,
  }
}
