import type { NextRequest } from 'next/server'

import { stageReference, finishReference } from '@/core/admin/reference-library/private-upload'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'

async function upload(request: NextRequest, operation: typeof stageReference | typeof finishReference) {
  try {
    assertSameOrigin(request)
    const actor = await requireApiAdmin()
    return jsonResponse(await operation(createAdminSupabase(), r2Store(), actor.id, await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-reference-upload')
  }
}

export const POST = (request: NextRequest) => upload(request, stageReference)
export const PATCH = (request: NextRequest) => upload(request, finishReference)
