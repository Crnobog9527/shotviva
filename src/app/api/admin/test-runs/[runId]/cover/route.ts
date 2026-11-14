import { revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { setTestRunCover, testCoverBodySchema } from '@/modules/image'

// 「设为封面」 on an admin test result (ARCHITECTURE §10.b, T85): result → "after", its test photo →
// "before", compressed by the cover rules and published; then the catalogue cache expires like
// any cover change: { expire: 0 } is updateTag's effect in a route handler (updateTag only runs
// in server actions), so the next load shows the new cover. Admin only (404 otherwise).
export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    const { runId } = await params
    if (!/^[0-9a-f-]{36}$/.test(runId)) throw new AppError('NOT_FOUND', 'Not found')
    // { locale }: which language's cover (T87); absent or null is the common cover.
    const body = testCoverBodySchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) throw new AppError('INVALID_INPUT', 'unknown language')
    const deps = { db: createAdminSupabase(), store: r2Store(), assets: r2PublicStore(), assetsBaseUrl: publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL }
    const templateId = await setTestRunCover(deps, admin.id, runId, body.data.locale ?? null)
    revalidateTag(TEMPLATES_CACHE_TAG, { expire: 0 })
    return jsonResponse({ template_id: templateId })
  } catch (error) {
    return errorResponse(error, 'admin-test-run-cover')
  }
}
