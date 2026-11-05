import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, requireApiUser } from '@/core/auth'
import { createUpload, r2Store } from '@/core/storage'

// POST { content_type, size } → { input_key, put_url, headers, expires_in }.
// Signed-in only. Never receives the photo: the browser PUTs it straight to R2 (AGENTS §6).
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body: unknown = await request.json().catch(() => null)
    return jsonResponse(await createUpload(r2Store(), user.id, body))
  } catch (error) {
    return errorResponse(error, 'uploads')
  }
}
