import { beforeEach, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({ settings: vi.fn(), published: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('notFound') }), redirect: vi.fn() }))
vi.mock('next/server', () => ({ connection: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }))
vi.mock('@/core/auth', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/core/i18n/server', () => ({ localized: vi.fn() }))
vi.mock('@/core/i18n/ui', () => ({ Link: () => null }))
vi.mock('../feature', () => ({ isAffiliateEnabled: vi.fn() }))
vi.mock('./terms', () => ({ publishedTerms: deps.published }))
vi.mock('./repository', () => ({ readSettings: deps.settings, readAccount: vi.fn() }))
vi.mock('./commission-list', () => ({ CommissionList: () => null }))
vi.mock('./settings-form', () => ({ SettingsForm: () => null }))
vi.mock('./overview', () => ({ Overview: () => null }))
vi.mock('./reports', () => ({ PayoutList: () => null, ReferralList: () => null, TeamReport: () => null }))
vi.mock('./terms-gate', () => ({ TermsGate: () => null }))
import { Dashboard } from './screen'
import { Overview } from './overview'
import { TermsGate } from './terms-gate'

const base = {
  slug: 'sv-a', status: 'active' as const, team_enabled: false, reject_reason: null, reapply_allowed: false,
  payout_method: null, payout_details: null, us_person: null, org_id: null,
}
const query = { view: 'overview' } as never

beforeEach(() => {
  vi.resetAllMocks()
  deps.settings.mockResolvedValue({ terms_version: '2026-11-21' })
  deps.published.mockResolvedValue('text')
})
const render = async (account: object) => (await Dashboard({ user: 'u', account: account as never, query })) as { type: unknown }

it('shows only the terms gate to an affiliate on an older version, personal or enterprise', async () => {
  for (const org_id of [null, '00000000-0000-4000-8000-000000000000']) {
    const element = await render({ ...base, org_id, terms_version: '2026-11-10', terms_accepted_at: '2026-11-10T00:00:00Z' })
    expect(element.type).toBe(TermsGate)
  }
})
it('gates an account with no recorded acceptance', async () => {
  expect((await render({ ...base, terms_version: '2026-11-21', terms_accepted_at: null })).type).toBe(TermsGate)
})
it('shows the dashboard once the current version is accepted', async () => {
  expect((await render({ ...base, terms_version: '2026-11-21', terms_accepted_at: '2026-11-22T00:00:00Z' })).type).toBe(Overview)
})
it('does not gate on a version whose text is not published', async () => {
  deps.published.mockResolvedValue(null)
  expect((await render({ ...base, terms_version: '2026-11-10', terms_accepted_at: '2026-11-10T00:00:00Z' })).type).toBe(Overview)
})
