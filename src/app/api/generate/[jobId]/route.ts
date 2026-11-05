import { errorResponse, jsonResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { findOwnJob, toJobView } from '@/core/jobs'

// GET → the caller's job status, so a page that was backgrounded mid-generation can pick the
// result up again (ARCHITECTURE §8.2). Signed-in only; other users' jobs are a 404.
export async function GET(_request: Request, { params }: RouteContext<'/api/generate/[jobId]'>) {
  try {
    const user = await requireApiUser()
    const job = await findOwnJob(createAdminSupabase(), user.id, (await params).jobId)
    if (!job) throw new AppError('NOT_FOUND', 'Not found')
    return jsonResponse(toJobView(job))
  } catch (error) {
    return errorResponse(error, 'generate-status')
  }
}
