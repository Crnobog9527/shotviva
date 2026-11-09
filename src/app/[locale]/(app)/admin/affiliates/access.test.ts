import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const spies = vi.hoisted(() => ({ admin: vi.fn(), enabled: vi.fn(), db: vi.fn(), mutate: vi.fn(), csv: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: spies.db, requireAdmin: spies.admin }))
vi.mock('@/core/affiliate/feature', () => ({ isAffiliateEnabled: spies.enabled }))
vi.mock('@/core/affiliate/admin', async () => ({
  ...(await import('@/core/affiliate/admin/access')),
  ...(await import('@/core/affiliate/admin/query')),
  COPY: {},
  execute: spies.mutate,
  exportCsv: spies.csv,
  AffiliateAdminView: () => null,
}))
const { default: page } = await import('./page')
const { enrollAffiliate } = await import('@/core/affiliate/admin/create-action')
const { saveAffiliate } = await import('./actions')
const { GET } = await import('@/app/api/admin/affiliates/export/route')
const endpoints = [
  () => page({ searchParams: Promise.resolve({}), params: Promise.resolve({ locale: 'en' }) }),
  () => saveAffiliate('', new FormData()),
  () => enrollAffiliate(new FormData()),
  () => GET(new Request('http://localhost/api/admin/affiliates/export?tab=commissions')),
]
describe('affiliate admin endpoints', () => {
  beforeEach(() => vi.resetAllMocks())
  it('404s for a non-admin before reading or exporting any data or executing a command', async () => {
    spies.admin.mockImplementation(notFound)
    for (const endpoint of endpoints) await expect(endpoint()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(spies.enabled).not.toHaveBeenCalled()
    expect(spies.db).not.toHaveBeenCalled()
  })
  it('404s every entry point for an admin when the program is disabled', async () => {
    spies.admin.mockResolvedValue({ id: 'admin' })
    spies.enabled.mockResolvedValue(false)
    for (const endpoint of endpoints) await expect(endpoint()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(spies.db).not.toHaveBeenCalled()
  })
  it('rejects invalid export filters rather than returning a wider export', async () => {
    spies.admin.mockResolvedValue({ id: 'admin' })
    spies.enabled.mockResolvedValue(true)
    const response = await GET(new Request('http://localhost/api/admin/affiliates/export?tab=commissions&affiliate=malformed'))
    expect(response.status).toBe(400)
    expect(spies.csv).not.toHaveBeenCalled()
  })
})
