import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, requireApiUser } from '@/core/auth'
import { createUploads, r2Store } from '@/core/storage'

// POST { content_type, count ≤ 10 } → { tickets: [{ input_key, put_url, headers, expires_in }] }.
// Signed-in only. A batch's photos share these presigned PUTs instead of one /api/uploads call
// each (queue-fairness plan §5); the photos still go straight to R2 (AGENTS §6).
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body: unknown = await request.json().catch(() => null)
    return jsonResponse(await createUploads(r2Store(), user.id, body))
  } catch (error) {
    return errorResponse(error, 'uploads-batch')
  }
}
