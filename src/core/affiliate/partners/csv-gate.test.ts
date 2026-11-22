import { beforeEach, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({ account: vi.fn(), settings: vi.fn(), commissions: vi.fn(), messages: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key, getMessages: deps.messages }))
vi.mock('@/core/auth', () => ({ requireApiUser: async () => ({ id: 'qa' }) }))
vi.mock('../feature', () => ({ isAffiliateEnabled: async () => true }))
vi.mock('./repository', () => ({
  readAccount: deps.account, readSettings: deps.settings, readCommissions: deps.commissions,
}))
import { exportCommissions } from './csv'

const active = { status: 'active', terms_version: '2026-11-10', terms_accepted_at: '2026-11-10T00:00:00Z' }
beforeEach(() => {
  vi.resetAllMocks()
  deps.settings.mockResolvedValue({ terms_version: '2026-11-21' })
  deps.messages.mockResolvedValue({ affiliateAgreement: { version: '2026-11-21', body: 'QA' } })
  deps.commissions.mockResolvedValue({ items: [], nextCursor: null })
})
it('refuses the export before the current terms are accepted', async () => {
  deps.account.mockResolvedValue(active)
  await expect(exportCommissions('en')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(deps.commissions).not.toHaveBeenCalled()
})
it('exports once the current terms are accepted', async () => {
  deps.account.mockResolvedValue({ ...active, terms_version: '2026-11-21' })
  const response = await exportCommissions('en')
  expect(response.status).toBe(200)
})
