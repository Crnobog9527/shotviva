import type { NextRequest } from 'next/server'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { reserveLabMatrix } from '@/modules/image'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const actor = await requireApiAdmin()
    const db = createAdminSupabase()
    return jsonResponse(await reserveLabMatrix(db, actor.id, await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-prompt-lab-matrix')
  }
}
