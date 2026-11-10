import type { NextRequest } from 'next/server'

import { referenceById } from '@/core/admin/reference-library/read'
import { editReference } from '@/core/admin/reference-library/write'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'

type Context = { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Context) {
  try {
    await requireApiAdmin()
    return jsonResponse(await referenceById(createAdminSupabase(), (await params).id))
  } catch (error) {
    return errorResponse(error, 'admin-reference-detail')
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    assertSameOrigin(request)
    const actor = await requireApiAdmin()
    await editReference(createAdminSupabase(), actor.id, (await params).id, await request.json().catch(() => null))
    return jsonResponse({ ok: true })
  } catch (error) {
    return errorResponse(error, 'admin-reference-edit')
  }
}
