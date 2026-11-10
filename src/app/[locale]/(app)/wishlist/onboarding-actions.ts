'use server'

import { createAdminSupabase, markOnboardingSeen, requireApiUser, type OnboardingFlag } from '@/core/auth'
import { assertWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

// The wishlist's first-run hints, marked seen once per account (Owner 2026-11-10). Server
// actions are public endpoints: each checks the switch and the session itself, and the id
// written to is always the session's, never one the browser sends.
async function mark(flag: OnboardingFlag): Promise<void> {
  await assertWishlistEnabled(site)
  const user = await requireApiUser()
  if (user.onboarding[flag]) return
  await markOnboardingSeen(createAdminSupabase(), user.id, flag)
}

// The first visit to /wishlist: its teaching sheet, and the tab's dot.
export async function markWishlistSeen(): Promise<void> {
  await mark('wishlistSeen')
}

// "You can now request templates", after the first photo.
export async function markWishlistHintSeen(): Promise<void> {
  await mark('wishlistHintSeen')
}
