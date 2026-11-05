import type { Job, JobStatus, JobVisibility } from './job-schema'

// What the browser sees of a job. Never image bytes (AGENTS §6): the result is fetched from
// the download route, which applies the watermark rule.
export type JobView = {
  id: string
  status: JobStatus
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
    visibility: job.visibility,
    template_id: job.templateId,
    credits_cost: job.creditsCost,
    error_code: job.errorCode,
    file_url: job.status === 'succeeded' ? fileUrlFor(job.id) : null,
    created_at: job.createdAt.toISOString(),
    finished_at: job.finishedAt?.toISOString() ?? null,
  }
}
