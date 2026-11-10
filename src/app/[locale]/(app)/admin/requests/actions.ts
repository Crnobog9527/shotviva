'use server'

import { refresh, updateTag } from 'next/cache'

import { runAdminAction, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { assertWishlistEnabled, reviewRequest, WISH_NOTICES_TAG, type ReviewInput } from '@/core/wishlist'
import { site } from '@/site/site.config'

// Server actions are public endpoints, so this re-checks the admin role and the switch itself.
export async function reviewRequestAction(input: ReviewInput): Promise<ActionResult> {
  await assertWishlistEnabled(site)
  await requireAdmin()
  return runAdminAction(async () => {
    await reviewRequest({ db: createAdminSupabase(), store: r2Store() }, input)
    if (input.action === 'ship') updateTag(WISH_NOTICES_TAG)
    refresh()
  })
}
