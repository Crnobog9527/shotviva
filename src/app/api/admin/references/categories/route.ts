import type { NextRequest } from 'next/server'

import { changeReferenceCategory } from '@/core/admin/reference-library/write'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const actor = await requireApiAdmin()
    await changeReferenceCategory(createAdminSupabase(), actor.id, await request.json().catch(() => null))
    return jsonResponse({ ok: true })
  } catch (error) {
    return errorResponse(error, 'admin-reference-categories')
  }
}
