import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { editBodySchema, editDecider, imageProvider, runEdit, toEditRequest } from '@/modules/image'

// Edit one of the caller's own finished photos with a sentence (ARCHITECTURE §5.2). Synchronous
// like /api/generate, with the same 300s budget. Signed-in only; answers with the new job.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body = editBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'source_job_id and instruction are required')
    const [provider, decider] = await Promise.all([imageProvider(), editDecider()])
    const deps = { db: createAdminSupabase(), store: r2Store(), provider, decider }
    return jsonResponse(await runEdit(deps, toEditRequest(user.id, body.data)))
  } catch (error) {
    return errorResponse(error, 'edit')
  }
}
