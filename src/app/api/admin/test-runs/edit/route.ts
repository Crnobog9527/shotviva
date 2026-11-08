import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { editScopeClassifier, imageProvider, runTestEdit, signRun, testEditBodySchema } from '@/modules/image'

// 「编辑」 on an admin test result (ARCHITECTURE §10.b, T85): the photo-edit pipeline of /api/edit on
// a test run instead of a work. Admin only (404 otherwise); synchronous, 300 s; ×3 is three POSTs.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    const body = testEditBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'run_id, batch_id, parent_id and instruction are required')
    const [provider, classifier] = await Promise.all([imageProvider(), editScopeClassifier()])
    const deps = { db: createAdminSupabase(), store: r2Store(), provider, classifier }
    return jsonResponse(await signRun(deps.store, await runTestEdit(deps, { actorId: admin.id, body: body.data })))
  } catch (error) {
    return errorResponse(error, 'admin-test-runs-edit')
  }
}
