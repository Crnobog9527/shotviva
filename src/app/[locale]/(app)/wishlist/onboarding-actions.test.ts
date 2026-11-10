import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  site: { features: { wishlist: true } },
  getSessionUser: vi.fn(),
  markOnboardingSeen: vi.fn(),
}))

vi.mock('@/site/site.config', () => ({ site: mocks.site }))
vi.mock('@/core/system-settings/read', () => ({ cachedSystemSettings: async () => ({ wishlist_enabled: true }) }))
vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ admin: true }) }))
vi.mock('@/core/auth/onboarding-store', () => ({ markOnboardingSeen: mocks.markOnboardingSeen }))

const { markWishlistHintSeen, markWishlistSeen } = await import('./onboarding-actions')

const unseen = { wishlistSeen: false, wishlistHintSeen: false }
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', verified: true, banned: false, onboarding: unseen }

describe('wishlist onboarding actions', () => {
  beforeEach(() => {
    mocks.site.features.wishlist = true
    mocks.getSessionUser.mockReset().mockResolvedValue(USER)
    mocks.markOnboardingSeen.mockReset().mockResolvedValue(undefined)
  })

  it('write the flag for the session user only', async () => {
    await markWishlistSeen()
    expect(mocks.markOnboardingSeen).toHaveBeenCalledWith({ admin: true }, USER.id, 'wishlistSeen')
    await markWishlistHintSeen()
    expect(mocks.markOnboardingSeen).toHaveBeenLastCalledWith({ admin: true }, USER.id, 'wishlistHintSeen')
  })

  it('do nothing for a flag the session already has', async () => {
    mocks.getSessionUser.mockResolvedValue({ ...USER, onboarding: { wishlistSeen: true, wishlistHintSeen: true } })
    await markWishlistSeen()
    await markWishlistHintSeen()
    expect(mocks.markOnboardingSeen).not.toHaveBeenCalled()
  })

  it('refuse while the wishlist is off, and signed-out callers', async () => {
    mocks.site.features.wishlist = false
    await expect(markWishlistSeen()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    mocks.site.features.wishlist = true
    mocks.getSessionUser.mockResolvedValue(null)
    await expect(markWishlistHintSeen()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.markOnboardingSeen).not.toHaveBeenCalled()
  })
})
