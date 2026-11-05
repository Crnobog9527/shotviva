import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { assertWishlistEnabled, toggleVote } from '@/core/wishlist'
import { site } from '@/site/site.config'

// POST → { voted, votesCount }. Signed-in only. Toggles the caller's vote on a live request.
export async function POST(request: NextRequest, { params }: RouteContext<'/api/wishlist/requests/[id]/vote'>) {
  try {
    assertWishlistEnabled(site)
    assertSameOrigin(request)
    const user = await requireApiUser()
    const { id } = await params
    return jsonResponse(await toggleVote(createAdminSupabase(), user.id, id))
  } catch (error) {
    return errorResponse(error, 'wishlist.vote')
  }
}
