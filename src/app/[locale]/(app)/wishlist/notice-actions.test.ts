import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  site: { features: { wishlist: true } },
  settings: vi.fn(),
  getSessionUser: vi.fn(),
  rpc: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/site/site.config', () => ({ site: mocks.site }))
vi.mock('@/core/system-settings/read', () => ({ cachedSystemSettings: mocks.settings, SYSTEM_SETTINGS_CACHE_TAG: 'system-settings' }))
vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: mocks.revalidateTag }))

const { markWishNoticesSeenAction } = await import('./notice-actions')

const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', verified: true }
const SHOWN = '00000000-0000-4000-8000-000000000106'

describe('markWishNoticesSeenAction', () => {
  beforeEach(() => {
    mocks.site.features.wishlist = true
    mocks.settings.mockReset().mockResolvedValue({ wishlist_enabled: true })
    mocks.getSessionUser.mockReset().mockResolvedValue(USER)
    mocks.rpc.mockReset().mockResolvedValue({ data: null })
    mocks.revalidateTag.mockReset()
  })

  it('marks the shown notices for the session user and expires only their cache', async () => {
    await markWishNoticesSeenAction([SHOWN])
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('mark_wish_notices_seen', { p_user_id: USER.id, p_request_ids: [SHOWN] })
    expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith(`wish-notices:${USER.id}`, { expire: 0 })
  })

  it('does nothing while the wishlist is off, on the site or by the admin switch', async () => {
    mocks.site.features.wishlist = false
    await markWishNoticesSeenAction([SHOWN])
    mocks.site.features.wishlist = true
    mocks.settings.mockResolvedValue({ wishlist_enabled: false })
    await markWishNoticesSeenAction([SHOWN])
    expect(mocks.getSessionUser).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it.each([null, { ...USER, verified: false }])('does nothing without a verified session', async (viewer) => {
    mocks.getSessionUser.mockResolvedValue(viewer)
    await markWishNoticesSeenAction([SHOWN])
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses malformed or oversized lists', async () => {
    const six = Array.from({ length: 6 }, () => SHOWN)
    for (const bad of [six, 'not-a-list', [42]] as unknown as string[][]) {
      await expect(markWishNoticesSeenAction(bad)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }
    await expect(markWishNoticesSeenAction(['not-a-uuid'])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
