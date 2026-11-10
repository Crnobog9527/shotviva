import type { NextRequest } from 'next/server'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'
import { publishLabRun } from '@/modules/image'

// 「发布为模板」 (T101): an inactive, not-for-sale draft. Not listed yet, so the catalogue cache stays.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const actor = await requireApiAdmin()
    const assetsBaseUrl = publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL
    if (!assetsBaseUrl) throw new AppError('INTERNAL', 'NEXT_PUBLIC_ASSETS_BASE_URL is not configured')
    const deps = { db: createAdminSupabase(), store: r2Store(), assets: r2PublicStore(), assetsBaseUrl }
    return jsonResponse(await publishLabRun(deps, actor.id, await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-prompt-lab-publish')
  }
}
