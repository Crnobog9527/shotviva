import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { findOwnJobs, STATUS_IDS_MAX, toJobView } from '@/core/jobs'

// GET ?ids=a,b,c → { jobs: JobView[] }: the caller's jobs among those ids, so a batch polls once
// per pass instead of once per photo (queue-fairness plan §5). Signed-in only; ids that are not
// the caller's (or do not exist yet) are left out, which the browser reads as "missing".
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser()
    const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean)
    if (ids.length === 0 || ids.length > STATUS_IDS_MAX) throw new AppError('INVALID_INPUT', `Between 1 and ${STATUS_IDS_MAX} ids`)
    const jobs = await findOwnJobs(createAdminSupabase(), user.id, ids)
    return jsonResponse({ jobs: jobs.map(toJobView) })
  } catch (error) {
    return errorResponse(error, 'generate-status-many')
  }
}
