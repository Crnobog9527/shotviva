import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { cleanupOnOpen } from '@/modules/image'

// The 30-day cleanup the test-run panel runs when it opens (ARCHITECTURE §10.b 「隔离」: no
// scheduled job). It deletes data, so it is a same-origin POST, never a GET. Admin only (404
// otherwise); a failed cleanup is logged and the panel opens anyway.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    await cleanupOnOpen({ db: createAdminSupabase(), store: r2Store() }, admin.id)
    return jsonResponse({ ok: true })
  } catch (error) {
    return errorResponse(error, 'admin-test-runs-cleanup')
  }
}
