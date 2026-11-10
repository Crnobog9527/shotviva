import { beforeEach, expect, it, vi } from 'vitest'

import { testSite } from '../seo/test-site'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), viewer: vi.fn(), settings: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(),
}))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
vi.mock('../auth/session', () => ({ getSessionUser: mocks.viewer }))
vi.mock('../system-settings/read', () => ({ cachedSystemSettings: mocks.settings, SYSTEM_SETTINGS_CACHE_TAG: 'system-settings' }))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: mocks.cacheTag, revalidateTag: mocks.revalidateTag }))

import { listMyWishNotices, markWishNoticesSeen, WISH_NOTICES_TAG } from './notices'

const site = testSite({ features: { affiliate: false, wishlist: true } })
const id = '00000000-0000-4000-8000-000000000106'
const user = '00000000-0000-4000-8000-000000000107'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.settings.mockResolvedValue({ wishlist_enabled: true })
  mocks.viewer.mockResolvedValue({ id: user, verified: true })
})

it('returns no notices and performs no write when either switch is closed', async () => {
  const off = testSite({ features: { affiliate: false, wishlist: false } })
  expect(await listMyWishNotices(off)).toEqual([])
  await markWishNoticesSeen(off, [id])
  expect(mocks.settings).not.toHaveBeenCalled()
  mocks.settings.mockResolvedValue({ wishlist_enabled: false })
  expect(await listMyWishNotices(site)).toEqual([])
  await markWishNoticesSeen(site, [id])
  expect(mocks.viewer).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it.each([null, { id: user, verified: false }])('requires a verified session', async viewer => {
  mocks.viewer.mockResolvedValue(viewer)
  expect(await listMyWishNotices(site)).toEqual([])
  await markWishNoticesSeen(site, [id])
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('uses the session user for both operations and expires only their cache after marking', async () => {
  const row = { request_id: id, template_id: 'flowers', template_name_en: 'Flowers', template_name_zh: '鲜花', description_excerpt: '花', is_author: true }
  mocks.rpc.mockResolvedValueOnce({ data: [row] }).mockResolvedValueOnce({ data: null })
  expect(await listMyWishNotices(site)).toEqual([row])
  expect(mocks.rpc).toHaveBeenCalledWith('list_my_wish_notices', { p_user_id: user })
  expect(mocks.cacheTag).toHaveBeenCalledWith(`${WISH_NOTICES_TAG}:${user}`, WISH_NOTICES_TAG, 'system-settings', 'templates')
  await markWishNoticesSeen(site, [id])
  expect(mocks.rpc).toHaveBeenCalledWith('mark_wish_notices_seen', { p_user_id: user, p_request_ids: [id] })
  expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith(`${WISH_NOTICES_TAG}:${user}`, { expire: 0 })
})

it('validates the IDs and reports failed writes before cache invalidation', async () => {
  await markWishNoticesSeen(site, [])
  await expect(markWishNoticesSeen(site, ['invalid'])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockResolvedValue({ error: { message: 'unavailable' } })
  await expect(markWishNoticesSeen(site, [id])).rejects.toMatchObject({ code: 'INTERNAL' })
  expect(mocks.revalidateTag).not.toHaveBeenCalled()
})
