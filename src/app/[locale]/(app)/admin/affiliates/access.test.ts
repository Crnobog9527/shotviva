import { notFound } from 'next/navigation'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const spies = vi.hoisted(() => ({ admin: vi.fn(), enabled: vi.fn(), db: vi.fn(), mutate: vi.fn(), csv: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: spies.db, requireAdmin: spies.admin }))
vi.mock('next/cache', () => ({ refresh: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/core/affiliate/feature', () => ({ isAffiliateEnabled: spies.enabled }))
vi.mock('@/core/affiliate/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/affiliate/admin')>()),
  execute: spies.mutate,
  exportCsv: spies.csv,
}))
const { default: page } = await import('./page')
const { enrollAffiliate } = await import('@/core/affiliate/admin')
const { saveAffiliate, saveAffiliateSwitchAction } = await import('./actions')
const { GET } = await import('@/app/api/admin/affiliates/export/route')
const endpoints = [
  () => page({ searchParams: Promise.resolve({}), params: Promise.resolve({ locale: 'en' }) }),
  () => saveAffiliate('', new FormData()),
  () => saveAffiliateSwitchAction({ enabled: true }),
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
  it('404s every entry point but the page and its switch for an admin when the program is disabled', async () => {
    spies.admin.mockResolvedValue({ id: 'admin' })
    spies.enabled.mockResolvedValue(false)
    const [, saveEndpoint, , enrollEndpoint, exportEndpoint] = endpoints
    for (const endpoint of [saveEndpoint, enrollEndpoint, exportEndpoint]) {
      await expect(endpoint()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    }
    expect(spies.db).not.toHaveBeenCalled()
  })
  it('shows an admin only the master switch while the program is disabled, reading no affiliate data', async () => {
    spies.admin.mockResolvedValue({ id: 'admin' })
    spies.enabled.mockResolvedValue(false)
    const element = await page({ searchParams: Promise.resolve({ tab: 'commissions' }), params: Promise.resolve({ locale: 'en' }) })
    const html = renderToStaticMarkup(element)
    expect(html).toContain('联盟营销总开关')
    expect(html).toContain('开启联盟营销')
    expect(html).not.toContain('<nav')
    expect(spies.db).not.toHaveBeenCalled()
  })
  it('lets an admin turn the program back on while it is disabled', async () => {
    spies.admin.mockResolvedValue({ id: 'admin' })
    spies.enabled.mockResolvedValue(false)
    const rpc = vi.fn().mockResolvedValue({ error: null })
    spies.db.mockReturnValue({ rpc })
    await expect(saveAffiliateSwitchAction({ enabled: true })).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('admin_affiliate_settings', { p_actor: 'admin', p_input: { enabled: true } })
    await expect(saveAffiliateSwitchAction({ enabled: 'yes' })).resolves.toMatchObject({ ok: false })
  })
  it('rejects invalid export filters rather than returning a wider export', async () => {
    spies.admin.mockResolvedValue({ id: 'admin' })
    spies.enabled.mockResolvedValue(true)
    const response = await GET(new Request('http://localhost/api/admin/affiliates/export?tab=commissions&affiliate=malformed'))
    expect(response.status).toBe(400)
    expect(spies.csv).not.toHaveBeenCalled()
  })
})
