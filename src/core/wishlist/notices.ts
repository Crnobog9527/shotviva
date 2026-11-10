import 'server-only'

import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { z } from 'zod'

import { getSessionUser } from '../auth/session'
import { createAdminSupabase } from '../auth/supabase-admin'
import type { SiteConfig } from '../config'
import { AppError } from '../errors'
import { cachedSystemSettings, SYSTEM_SETTINGS_CACHE_TAG } from '../system-settings/read'
import { settingValue } from '../system-settings/registry'
import { TEMPLATES_CACHE_TAG } from '../templates/cache'
import { wishlistRpc } from './rpc'
import { requestIdSchema } from './schema'
import { siteHasWishlist } from './switch'

export const WISH_NOTICES_TAG = 'wish-notices'
const userTag = (userId: string) => `${WISH_NOTICES_TAG}:${userId}`

const notice = z.object({
  request_id: requestIdSchema,
  template_id: z.string(),
  template_name_en: z.string(),
  template_name_zh: z.string(),
  description_excerpt: z.string(),
  is_author: z.boolean(),
})
export type WishNotice = z.infer<typeof notice>

// The preview override opens the wall for testing. Notices require the actual admin switch.
async function noticeViewer(site: SiteConfig) {
  if (!siteHasWishlist(site) || !settingValue(await cachedSystemSettings(), 'wishlist_enabled')) return null
  const user = await getSessionUser()
  return user?.verified ? user.id : null
}

async function unreadFor(userId: string) {
  'use cache'
  cacheTag(userTag(userId), WISH_NOTICES_TAG, SYSTEM_SETTINGS_CACHE_TAG, TEMPLATES_CACHE_TAG)
  cacheLife('minutes')
  return wishlistRpc(createAdminSupabase(), 'list_my_wish_notices', { p_user_id: userId }, z.array(notice))
}

export async function listMyWishNotices(site: SiteConfig): Promise<WishNotice[]> {
  const userId = await noticeViewer(site)
  return userId ? unreadFor(userId) : []
}

// Call from a Route Handler (api/wishlist/notices/seen), which can expire this cache without
// refetching the page the banner is on, as a Server Action would.
export async function markWishNoticesSeen(site: SiteConfig, requestIds: string[]): Promise<void> {
  const userId = await noticeViewer(site)
  if (!userId) return
  const ids = z.array(requestIdSchema).safeParse(requestIds)
  if (!ids.success) throw new AppError('INVALID_INPUT', 'Invalid wishlist request IDs')
  if (!ids.data.length) return
  await wishlistRpc(createAdminSupabase(), 'mark_wish_notices_seen', {
    p_user_id: userId,
    p_request_ids: ids.data,
  }, z.null())
  revalidateTag(userTag(userId), { expire: 0 })
}
