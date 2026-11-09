import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
const adminNavItems = vi.fn()
const openTicketCount = vi.fn()
const newInquiryCount = vi.fn()

vi.mock('@/core/auth', () => ({ requireAdmin: () => requireAdmin(), createAdminSupabase: () => ({}) }))
vi.mock('@/core/admin', () => ({
  AdminShell: () => null,
  UserDialogHost: () => null,
  adminNavItems: (flags: unknown, counts: unknown) => adminNavItems(flags, counts),
}))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ VERCEL_ENV: 'preview' }) }))
vi.mock('./jobs/actions', () => ({ compensateJobAction: vi.fn(), viewWorkAction: vi.fn() }))
vi.mock('./users/actions', () => ({ adjustCreditsAction: vi.fn(), banUserAction: vi.fn(), unbanUserAction: vi.fn(), userDetailAction: vi.fn() }))
vi.mock('@/core/support', () => ({ openTicketCount: () => openTicketCount() }))
vi.mock('@/core/inquiries', () => ({ newInquiryCount: () => newInquiryCount() }))
vi.mock('@/core/logger', () => ({ logger: { warn: () => undefined } }))
vi.mock('@/core/affiliate/feature', () => ({isAffiliateEnabled: async () => false}))
vi.mock('@/core/wishlist', () => ({ isWishlistEnabled: async () => false }))
vi.mock('@/site/site.config', () => ({ site: {} }))

const { default: AdminLayout } = await import('./layout')

// The one admin gate in the layout (T23). Real sessions through the proxy are covered in
// tests/db/admin-gate.test.ts.
describe('admin layout', () => {
  beforeEach(() => {
    requireAdmin.mockReset()
    adminNavItems.mockReset().mockReturnValue([])
    openTicketCount.mockReset().mockResolvedValue(3)
    newInquiryCount.mockReset().mockResolvedValue(2)
  })

  it('404s non-admins before building the shell', async () => {
    requireAdmin.mockImplementation(() => notFound())
    await expect(AdminLayout({ children: null } as never)).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(adminNavItems).not.toHaveBeenCalled()
    expect(openTicketCount).not.toHaveBeenCalled()
  })

  it('builds the nav without the review entry while the wishlist is off', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'owner@example.test' })
    await AdminLayout({ children: null } as never)
    expect(adminNavItems).toHaveBeenCalledWith({ wishlist: false, affiliate: false }, { tickets: 3, inquiries: 2 })
  })

  it('still builds the nav, without a count, when the ticket count fails (T27)', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'owner@example.test' })
    openTicketCount.mockRejectedValue(new Error('down'))
    await AdminLayout({ children: null } as never)
    expect(adminNavItems).toHaveBeenCalledWith({ wishlist: false, affiliate: false }, { tickets: 0, inquiries: 2 })
  })

  it('still builds the nav, without a count, when the inquiry count fails (T86)', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'owner@example.test' })
    newInquiryCount.mockRejectedValue(new Error('down'))
    await AdminLayout({ children: null } as never)
    expect(adminNavItems).toHaveBeenCalledWith({ wishlist: false, affiliate: false }, { tickets: 3, inquiries: 0 })
  })
})
