import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, requireApiAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { createTestPhotoUpload } from '@/modules/image'

// POST { content_type, size } → a 60-second presigned PUT for a new admin test photo (ARCHITECTURE
// §10.b, T85). The photo itself goes straight to R2 (AGENTS §6). Admin only (404 otherwise).
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    await requireApiAdmin()
    return jsonResponse(await createTestPhotoUpload(r2Store(), await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-test-photos')
  }
}
