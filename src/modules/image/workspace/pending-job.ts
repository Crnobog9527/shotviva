import type { TrackedJob } from '../generation/job-model'

// The one photo a workspace is showing, from the ids it holds: the case its page can start
// drawing before the server answers (workspace-pending.tsx). A batch or an empty workspace
// waits for the server as before: they need the tier, the balance or the template.
export function soleJob(workspaceIds: readonly string[], jobs: readonly TrackedJob[]): TrackedJob | null {
  if (workspaceIds.length !== 1) return null
  return jobs.find((candidate) => candidate.id === workspaceIds[0]) ?? null
}

// Still developing: queued behind the account's other photos, or running. A photo whose request
// was refused at once (balance, price check, moderation) has already left this state by the
// time the server's page arrives; the pending view then keeps its head and draws nothing under
// it, rather than a developing view that would turn into the failure a moment later.
export function isDeveloping(job: TrackedJob): boolean {
  return job.status === 'queued' || job.status === 'running'
}
