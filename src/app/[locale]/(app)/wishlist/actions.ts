'use server'

import { createServerSupabase, requireApiUser } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { assertWishlistEnabled, listMyRequests, listWall, type MyRequest, type Page, type WallCard } from '@/core/wishlist'
import { site } from '@/site/site.config'

// "Show more" on the wall and in My requests (AGENTS §5.1: keyset pages of 30). Server
// actions are public endpoints, so each checks the switch and the session itself; reads run
// on the viewer's own client, so RLS decides what comes back.

export async function loadWallPage(cursor: string): Promise<Page<WallCard>> {
  assertWishlistEnabled(site)
  await requireApiUser()
  return listWall(await createServerSupabase(), r2Store(), cursor)
}

export async function loadMyRequestsPage(cursor: string): Promise<Page<MyRequest>> {
  assertWishlistEnabled(site)
  const user = await requireApiUser()
  return listMyRequests(await createServerSupabase(), r2Store(), user.id, cursor)
}
