import { handleJob } from '@/core/partner'

import { withPartnerDeps } from '../../deps'

// Partner route: partner key + X-Shotviva-Account instead of a session (AGENTS §6 exception).
// Read-only job status for Graylum's timeout fallback.
export async function GET(request: Request, { params }: RouteContext<'/api/partner/jobs/[jobId]'>) {
  return withPartnerDeps('partner-job', async (deps) => handleJob(request, deps, (await params).jobId))
}
