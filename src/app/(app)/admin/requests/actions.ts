'use server'

import { refresh } from 'next/cache'

import { runAdminAction, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { assertWishlistEnabled, reviewRequest } from '@/core/wishlist'
import { site } from '@/site/site.config'

// Server actions are public endpoints, so this re-checks the admin role and the switch itself.
export async function reviewRequestAction(input: unknown): Promise<ActionResult> {
  assertWishlistEnabled(site)
  await requireAdmin()
  return runAdminAction(async () => {
    await reviewRequest({ db: createAdminSupabase(), store: r2Store() }, input)
    refresh()
  })
}
