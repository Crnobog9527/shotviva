import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { assertWishlistEnabled, markWishNoticesSeen } from '@/core/wishlist'
import { site } from '@/site/site.config'

// The banner shows at most the five unread notices list_my_wish_notices returns.
const bodySchema = z.object({ ids: z.array(z.string()).max(5) })

// POST { ids } → { ok: true }. Marks "your wish came true" notices seen as the banner shows
// them (ARCHITECTURE §15.4). A route handler, not a server action: an action that expires a
// cache makes the router refetch the page, which unmounted the banner it had just shown.
// The browser only says which notices it showed; whose they are comes from the session inside
// markWishNoticesSeen, which does nothing for a signed-out or unverified caller.
export async function POST(request: NextRequest) {
  try {
    await assertWishlistEnabled(site)
    assertSameOrigin(request)
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'Invalid wishlist request IDs')
    await markWishNoticesSeen(site, body.data.ids)
    return jsonResponse({ ok: true })
  } catch (error) {
    return errorResponse(error, 'wishlist.notices_seen')
  }
}
