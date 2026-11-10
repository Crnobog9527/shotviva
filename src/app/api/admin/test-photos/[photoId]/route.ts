import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { confirmTestPhoto, testPhotoConfirmSchema, thumbnailKey } from '@/modules/image'

// POST { key } after the PUT: lists the admin test photo under 「最近用过」 (ARCHITECTURE §10.b, T85).
// Admin only (404 otherwise).
export async function POST(request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    const { photoId } = await params
    const body = testPhotoConfirmSchema.safeParse(await request.json().catch(() => null))
    if (!body.success || !/^[0-9a-f-]{36}$/.test(photoId)) throw new AppError('INVALID_INPUT', 'key is required')
    const store = r2Store()
    const photo = await confirmTestPhoto({ db: createAdminSupabase(), store }, admin.id, photoId, body.data.key)
    const url = await store.presignGet(thumbnailKey(photo.objectKey), { expiresInSeconds: 600 })
    return jsonResponse({ id: photo.id, url, lastUsedAt: photo.lastUsedAt })
  } catch (error) {
    return errorResponse(error, 'admin-test-photos')
  }
}
