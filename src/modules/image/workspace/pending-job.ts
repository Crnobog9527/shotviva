import type { TrackedJob } from '../generation/job-model'

// The one photo a workspace is developing, from the ids it is showing: the case its page can
// draw before the server answers (workspace-pending.tsx). A batch, a settled photo or the form
// wait for the server as before: they need the tier, the balance or the template.
export function developingJob(workspaceIds: readonly string[], jobs: readonly TrackedJob[]): TrackedJob | null {
  if (workspaceIds.length !== 1) return null
  const job = jobs.find((candidate) => candidate.id === workspaceIds[0])
  return job && (job.status === 'queued' || job.status === 'running') ? job : null
}
