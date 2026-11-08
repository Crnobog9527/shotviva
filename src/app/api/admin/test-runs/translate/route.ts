import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { publicEnv } from '@/core/public-env'
import { r2PublicStore, r2Store } from '@/core/storage'
import { imageProvider, runTestTranslate, signRun, testTranslateBodySchema } from '@/modules/image'

// 「生成其他语言版本」 of a template cover (ARCHITECTURE §8.3, T87): one target language per request,
// run as an admin test run (budget, cost, records). Synchronous like the other test runs, 300 s;
// several languages are parallel POSTs. Admin only (404 otherwise).
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    const body = testTranslateBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'run_id, batch_id, template_id and target_locale are required')
    const deps = {
      db: createAdminSupabase(),
      store: r2Store(),
      provider: await imageProvider(),
      assets: r2PublicStore(),
      assetsBaseUrl: publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL,
    }
    return jsonResponse(await signRun(deps.store, await runTestTranslate(deps, { actorId: admin.id, body: body.data })))
  } catch (error) {
    return errorResponse(error, 'admin-test-runs-translate')
  }
}
