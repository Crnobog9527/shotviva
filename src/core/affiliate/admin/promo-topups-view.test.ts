import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { PromoPartner, PromoSheet } from './promo-read'
import { PromoSheetCard } from './promo-sheet'
import { TOPUP_COPY as T } from './promo-topup-copy'
import type { PromoTopup } from './promo-topup-read'
import { PromoTopups } from './promo-topups-view'

vi.mock('server-only', () => ({}))

const org = '0b1c2d3e-4f50-4617-8899-aabbccddeeff'
const owner = '1b1c2d3e-4f50-4617-8899-aabbccddeeff'
const admin = '2b1c2d3e-4f50-4617-8899-aabbccddeeff'
const partner: PromoPartner = { id: org, name: 'Acme', status: 'active', promo_partner: true, owner_user_id: owner }
const topup = (id: string, credits: number, period = '2026-12'): PromoTopup => ({
  id, org_id: org, period, recipient_user_id: owner, credits, reason: 'launch week ' + id, created_by: admin,
  created_at: '2026-12-03T02:00:00Z', expires_at: '2027-01-01T00:00:00Z', expired_credits: null,
})
const sheet = {
  id: '9', org_id: org, period: '2026-12', status: 'granted', recipient_user_id: owner, base: 10000, bonus: 0, raw_credits: 0,
  counted_credits: 0, customer_cap: 0, customers: 0, capped_customers: 0, clawback_owed: 0, clawback_applied: 0, total: 10000,
  fingerprint: '0123456789abcdef0123456789abcdef', computed_at: '2026-12-01T00:40:00Z', expires_at: '2027-01-01T00:00:00Z',
  decided_at: '2026-12-01T03:00:00Z', decision_note: null, expired_credits: null, orgs: { name: 'Acme' },
  detail: { per: [], sources: [], bonus_bp: 1000, customer_cap_bp: 2000, min_customers: 3 },
} satisfies PromoSheet
const render = (props: Partial<Parameters<typeof PromoTopups>[0]> = {}) =>
  renderToStaticMarkup(createElement(PromoTopups, {
    partners: [partner], sheets: [sheet], topups: [topup('1', 5000), topup('2', 2500), topup('3', 9999, '2026-11')],
    period: '2026-12', action: vi.fn(), ...props,
  }))

it("lists this month's top-ups of each partner with the month's total and the form", () => {
  const html = render()
  for (const text of ['Acme', '5,000', '2,500', 'launch week 1', 'launch week 2', admin.slice(0, 8), '7,500', '17,500', T.submit, T.reason]) {
    expect(html).toContain(text)
  }
  expect(html).not.toContain('launch week 3') // last month's
  expect(html).toContain(`value="${owner}"`)
  expect(html).toContain('value="2026-12"')
  expect(html).toContain('max="100000"')
})

it('counts a sheet only once it is granted, and offers no form to a non-partner or suspended org', () => {
  expect(render({ sheets: [{ ...sheet, status: 'pending', decided_at: null }] })).toContain(T.sheetNotGranted('待确认'))
  expect(render({ sheets: [] })).toContain(T.sheetNone)
  for (const p of [{ ...partner, promo_partner: false }, { ...partner, status: 'suspended' }]) {
    const html = render({ partners: [p] })
    expect(html).toContain(T.noPartners)
    expect(html).not.toContain('name="credits"')
  }
})

it('adds the top-ups of its month to a sheet', () => {
  const html = renderToStaticMarkup(createElement(PromoSheetCard, { sheet, topups: 7500, action: vi.fn(), now: new Date('2026-12-05T00:00:00Z') }))
  expect(html).toContain(T.sheetMonthTotal)
  expect(html).toContain('17,500')
})
