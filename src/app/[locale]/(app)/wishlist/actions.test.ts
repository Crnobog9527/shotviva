import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  site: { features: { wishlist: true } },
  getSessionUser: vi.fn(),
  listWall: vi.fn(),
  listMyRequests: vi.fn(),
}))

vi.mock('@/site/site.config', () => ({ site: mocks.site }))
// The admin switch is on; these tests close the wishlist through the site config.
vi.mock('@/core/system-settings/read', () => ({ cachedSystemSettings: async () => ({ wishlist_enabled: true }) }))
vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-server', () => ({ createServerSupabase: async () => ({}) }))
vi.mock('@/core/storage/r2-store', () => ({ r2Store: () => ({}) }))
vi.mock('@/core/wishlist/wall', () => ({ listWall: mocks.listWall, listMyRequests: mocks.listMyRequests }))

const { loadMyRequestsPage, loadWallPage } = await import('./actions')

const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', emailVerified: true, banned: false }
const PAGE = { items: [], nextCursor: null }

describe('wishlist "Show more" actions', () => {
  beforeEach(() => {
    mocks.site.features.wishlist = true
    mocks.getSessionUser.mockReset().mockResolvedValue(USER)
    mocks.listWall.mockReset().mockResolvedValue(PAGE)
    mocks.listMyRequests.mockReset().mockResolvedValue(PAGE)
  })

  it('refuse while the wishlist is off, before touching the session', async () => {
    mocks.site.features.wishlist = false
    await expect(loadWallPage('c')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(loadMyRequestsPage('c')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(mocks.getSessionUser).not.toHaveBeenCalled()
  })

  it('refuse signed-out callers', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    await expect(loadWallPage('c')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(loadMyRequestsPage('c')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('pass the cursor on, and scope My requests to the session user', async () => {
    expect(await loadWallPage('w1')).toEqual(PAGE)
    expect(mocks.listWall).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'w1')
    await loadMyRequestsPage('m1')
    expect(mocks.listMyRequests).toHaveBeenCalledWith(expect.anything(), expect.anything(), USER.id, 'm1')
  })
})
