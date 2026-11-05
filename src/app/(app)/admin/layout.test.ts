import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
const adminNavItems = vi.fn()

vi.mock('@/core/auth', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/core/admin', () => ({ AdminShell: () => null, adminNavItems: (flags: unknown) => adminNavItems(flags) }))
vi.mock('@/core/wishlist', () => ({ isWishlistEnabled: () => false }))
vi.mock('@/site/site.config', () => ({ site: {} }))

const { default: AdminLayout } = await import('./layout')

// The one admin gate in the layout (T23). Real sessions through the proxy are covered in
// tests/db/admin-gate.test.ts.
describe('admin layout', () => {
  beforeEach(() => {
    requireAdmin.mockReset()
    adminNavItems.mockReset().mockReturnValue([])
  })

  it('404s non-admins before building the shell', async () => {
    requireAdmin.mockImplementation(() => notFound())
    await expect(AdminLayout({ children: null } as never)).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(adminNavItems).not.toHaveBeenCalled()
  })

  it('builds the nav without the review entry while the wishlist is off', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: 'owner@example.test' })
    await AdminLayout({ children: null } as never)
    expect(adminNavItems).toHaveBeenCalledWith({ wishlist: false })
  })
})
