import { after, type NextRequest } from 'next/server'

import { drainReferenceDeletions } from '@/core/admin/reference-library/object-cleanup'
import { batchReferences } from '@/core/admin/reference-library/write'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const actor = await requireApiAdmin()
    const db = createAdminSupabase()
    const operation = await batchReferences(db, actor.id, await request.json().catch(() => null))
    if (operation === 'delete') after(async () => { await drainReferenceDeletions(db, actor.id) })
    return jsonResponse({ ok: true })
  } catch (error) {
    return errorResponse(error, 'admin-references-batch')
  }
}
