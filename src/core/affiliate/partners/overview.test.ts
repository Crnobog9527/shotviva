import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { Account, PartnerFees, Settings } from './models'
import { Overview } from './overview'

// Each translation renders as `key{params}`, so the threshold the view chose is visible.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, params?: object) => key + (params ? JSON.stringify(params) : ''),
}))
vi.mock('@/core/i18n/server', () => ({ currentLocale: async () => 'en' }))
vi.mock('@/core/i18n/ui', () => ({ Link: 'a' }))
vi.mock('../copy-link', () => ({ CopyLink: () => null }))
vi.mock('./repository', () => ({
  readSummary: async () => ({ clicks: 0, referred: 0, paidUsers: 0, pending: 0, available: 30000, paid: 0, maturing: 0, nextSettlement: '2031-05-01' }),
  readFees: async (): Promise<PartnerFees> => ({ method: 'bank', rules: [], estimate: { gross: 30000, fees: 0, net: 30000, lines: [] } }),
}))

const settings: Settings = { terms_version: 'v2', hold_days: 30, payout_min_usd: 20000, org_payout_min_usd: 100000, settlement_day: 1, apply_min_level: 'none' }
const account: Account = {
  status: 'active', slug: 'qa-org', team_enabled: false, reapply_allowed: false, reject_reason: null, payout_method: 'bank',
  payout_details: 'fixture', us_person: false, terms_version: 'v2', terms_accepted_at: '2026-01-01T00:00:00Z', org_id: null,
}
const html = async (org_id: string | null) =>
  renderToStaticMarkup(await Overview({ user: 'u', account: { ...account, org_id }, settings }))

it('measures an enterprise account against the enterprise threshold: progress, gap and fee panel', async () => {
  const result = await html('00000000-0000-4000-8000-000000000001')
  expect(result).toContain('gap{&quot;threshold&quot;:&quot;$1,000.00&quot;,&quot;gap&quot;:&quot;$700.00&quot;}')
  expect(result).toContain('aria-valuenow="30"')
  expect(result).toContain('fees.intro{&quot;threshold&quot;:&quot;$1,000.00&quot;}')
  expect(result).toContain('notEligible')
  expect(result).not.toContain('$200.00')
})

it('keeps a personal account on the personal threshold', async () => {
  const result = await html(null)
  expect(result).toContain('thresholdMet{&quot;threshold&quot;:&quot;$200.00&quot;}')
  expect(result).toContain('fees.intro{&quot;threshold&quot;:&quot;$200.00&quot;}')
  expect(result).not.toContain('$1,000.00')
})
