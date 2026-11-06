import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listAdminRequests: vi.fn(),
  site: { features: { wishlist: true } },
}))

vi.mock('@/core/auth', () => ({ requireAdmin: () => mocks.requireAdmin(), createAdminSupabase: () => ({}) }))
vi.mock('@/core/storage', () => ({ r2Store: () => ({}) }))
vi.mock('@/site/site.config', () => ({ site: mocks.site }))
vi.mock('@/core/wishlist', () => ({
  isWishlistEnabled: (site: typeof mocks.site) => site.features.wishlist,
  listAdminRequests: () => mocks.listAdminRequests(),
  listTemplateOptions: async () => [],
}))
vi.mock('@/core/wishlist/admin-ui', () => ({ RequestsReview: () => null, REQUESTS_COPY: { title: '需求审核' } }))
vi.mock('./actions', () => ({ reviewRequestAction: vi.fn() }))
vi.mock('@/core/admin', () => ({ AdminPage: () => null }))

const { default: AdminRequestsPage } = await import('./page')

const is404 = { digest: expect.stringMatching(/404/) }

describe('admin requests page', () => {
  beforeEach(() => {
    mocks.site.features.wishlist = true
    mocks.requireAdmin.mockReset().mockResolvedValue({ id: 'admin', email: null })
    mocks.listAdminRequests.mockReset().mockResolvedValue([])
  })

  it('404s while the wishlist is switched off, before any admin check or query', async () => {
    mocks.site.features.wishlist = false
    await expect(AdminRequestsPage()).rejects.toMatchObject(is404)
    expect(mocks.requireAdmin).not.toHaveBeenCalled()
    expect(mocks.listAdminRequests).not.toHaveBeenCalled()
  })

  it('404s non-admins before loading any request', async () => {
    mocks.requireAdmin.mockImplementation(() => notFound())
    await expect(AdminRequestsPage()).rejects.toMatchObject(is404)
    expect(mocks.listAdminRequests).not.toHaveBeenCalled()
  })

  it('loads requests for admins', async () => {
    await AdminRequestsPage()
    expect(mocks.listAdminRequests).toHaveBeenCalledOnce()
  })
})
