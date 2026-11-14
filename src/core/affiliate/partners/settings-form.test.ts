import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Account, Settings } from './models'
import { SettingsForm } from './settings-form'

const terms = vi.hoisted(() => vi.fn())
vi.mock('./terms', () => ({ publishedTerms: terms }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@/core/i18n/server', () => ({ currentLocale: async () => 'en' }))
vi.mock('@/core/i18n/ui', () => ({ Link: 'a' }))
vi.mock('./actions', () => ({ saveAction: vi.fn() }))
vi.mock('./interactive', () => ({ PartnerForm: ({ children }: { children: ReactNode }) => createElement('form', null, children) }))

const settings: Settings = { terms_version: 'v2', hold_days: 30, payout_min_usd: 20000, settlement_day: 1, apply_min_level: 'none' }
const account: Account = {
  status: 'active', slug: 'qa-member', team_enabled: false, reapply_allowed: false, reject_reason: null, payout_method: 'wise',
  payout_details: 'Saved payout account', us_person: false, terms_version: 'v2', terms_accepted_at: '2026-01-01T00:00:00Z',
}
async function html(overrides: Partial<Account> = {}) {
  return renderToStaticMarkup(await SettingsForm({ account: { ...account, ...overrides }, settings }))
}
beforeEach(() => terms.mockReset())
it('keeps payment details editable for an active member with a dated current acceptance', async () => {
  const result = await html()
  expect(result).toContain('<form>')
  expect(result).toContain('Saved payout account')
  expect(result).not.toMatch(/<(?:select|textarea)[^>]*disabled|name="accept"/)
  expect(terms).not.toHaveBeenCalled()
})
it.each([{ terms_version: null, terms_accepted_at: null }, { terms_accepted_at: null }, { terms_version: 'v1' }])(
  'shows existing details read-only while the required terms are unavailable', async (prior) => {
    const result = await html(prior)
    expect(result).toContain('Saved payout account')
    expect(result.match(/<(?:select|textarea)[^>]*disabled/g)).toHaveLength(3)
    expect(result).not.toMatch(/<form|name="accept"/)
  },
)
it('offers an unchecked new consent only once the current text is published', async () => {
  terms.mockResolvedValue('QA terms')
  const result = await html({ terms_version: 'v1' })
  expect(result).toContain('name="accept"')
  expect(result).toContain('value="v2"')
  expect(result).not.toMatch(/<(?:select|textarea)[^>]*disabled|checked=""/)
})
