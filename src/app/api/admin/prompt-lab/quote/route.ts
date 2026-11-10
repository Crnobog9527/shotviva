import type { NextRequest } from 'next/server'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { quoteLabMatrix } from '@/modules/image'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    await requireApiAdmin()
    const db = createAdminSupabase()
    return jsonResponse(await quoteLabMatrix(db, await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-prompt-lab-quote')
  }
}
