import type { NextRequest } from 'next/server'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { reverseLabPrompt } from '@/modules/image'

export const maxDuration = 150

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const actor = await requireApiAdmin()
    const db = createAdminSupabase()
    return jsonResponse(await reverseLabPrompt({ db, store: r2Store() }, actor.id, await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-prompt-lab-reverse')
  }
}
