import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { assertWishlistEnabled, createRequest } from '@/core/wishlist'
import { site } from '@/site/site.config'

// POST { description, input_keys } → 201 { id, status: 'pending' }. Signed-in only.
// input_keys come from /api/uploads; the photos themselves never pass through here (AGENTS §6).
export async function POST(request: NextRequest) {
  try {
    await assertWishlistEnabled(site)
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body: unknown = await request.json().catch(() => null)
    const created = await createRequest({ db: createAdminSupabase(), store: r2Store() }, user.id, body)
    return jsonResponse({ id: created.id, status: created.status }, 201)
  } catch (error) {
    return errorResponse(error, 'wishlist.requests')
  }
}
