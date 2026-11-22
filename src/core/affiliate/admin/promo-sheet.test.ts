import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { PROMO_COPY as P } from './promo-copy'
import type { PromoSheet } from './promo-read'
import { PromoSheetCard } from './promo-sheet'

vi.mock('server-only', () => ({}))

const now = new Date('2026-12-05T00:00:00Z')
const customer = '6f1c6a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f'
const sheet: PromoSheet = {
  id: '9', org_id: '0b1c2d3e-4f50-4617-8899-aabbccddeeff', period: '2026-12', status: 'pending',
  recipient_user_id: '1b1c2d3e-4f50-4617-8899-aabbccddeeff', base: 10000, bonus: 30000, raw_credits: 300000,
  counted_credits: 300000, customer_cap: 300000, customers: 5, capped_customers: 0, clawback_owed: 3000, clawback_applied: 3000,
  total: 37000, fingerprint: '0123456789abcdef0123456789abcdef', computed_at: '2026-12-01T00:40:00Z',
  expires_at: '2027-01-01T00:00:00Z', decided_at: null, decision_note: null, expired_credits: null, voided_at: null, void_reason: null, orgs: { name: 'Acme' },
  detail: {
    per: [{ customer, raw: 200000, counted: 200000, capped: false }],
    sources: [{ grant_id: 4, period: '2026-11', owed: 3000, applied: 3000 }],
    bonus_bp: 1000, customer_cap_bp: 10000, min_customers: 0,
    window_start: '2026-11-01T00:00:00Z', window_end: '2026-12-01T00:00:00Z',
  },
}
const render = (s: PromoSheet) => renderToStaticMarkup(createElement(PromoSheetCard, { sheet: s, action: vi.fn(), now }))

it('shows every number the grant is made of, the breakdown and the decisions while pending', () => {
  const html = render(sheet)
  for (const text of ['Acme', '10,000', '30,000', '300,000', '200,000', '37,000', P.bonus, P.counted, P.sourceRow('2026-11', 3000, 3000), P.confirm, P.reject, P.recompute]) {
    expect(html).toContain(text)
  }
  expect(html).toContain('value="0123456789abcdef0123456789abcdef"')
})

it('names the bonus 推广积分奖励 and shows no per-customer cap or customer minimum', () => {
  const html = render({ ...sheet, customers: 1 })
  expect(P.bonus).toBe('推广积分奖励')
  expect(P.counted).toBe('计入的奖励基数')
  for (const gone of ['业绩', '单客户上限', '付费客户，本月只发保底', '触到上限', P.cappedMark]) expect(html).not.toContain(gone)
  expect(P.intro).not.toMatch(/业绩|20%|3 个付费客户/)
})

it('marks a customer capped on a sheet granted under the old rules', () => {
  const old = { ...sheet, detail: { ...sheet.detail, per: [{ customer, raw: 200000, counted: 60000, capped: true }] } }
  expect(render(old)).toContain(P.cappedMark)
})

it('offers no decision once decided or past its month', () => {
  for (const s of [{ ...sheet, status: 'granted', decided_at: '2026-12-02T00:00:00Z' }, { ...sheet, expires_at: '2026-12-01T00:00:00Z' }]) {
    const html = render(s)
    expect(html).not.toContain(P.confirm)
    expect(html).not.toContain(P.reject)
  }
  expect(render({ ...sheet, status: 'granted', decided_at: '2026-12-02T00:00:00Z' })).toContain(P.status.granted)
})

it('flags a granted sheet past its month that the expiry pass has not taken back yet', () => {
  const late = { ...sheet, status: 'granted', decided_at: '2026-12-02T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' }
  expect(render(late)).toContain(P.expiryOverdue)
  expect(render({ ...late, expired_credits: 500 })).toContain(P.expired(500))
  expect(render({ ...late, expired_credits: 500 })).not.toContain(P.expiryOverdue)
})

it('offers 作废 on a granted sheet not yet taken back, and shows the void once done', async () => {
  const granted = { ...sheet, status: 'granted', decided_at: '2026-12-02T00:00:00Z' }
  const html = render(granted)
  expect(html).toContain(P.void)
  expect(html).toContain('value="promoVoid"')
  expect(html).toContain('name="reason"')
  expect(html).not.toContain(P.voided)
  // Not offered while pending or once the expiry pass has taken it back.
  expect(render(sheet)).not.toContain('value="promoVoid"')
  expect(render({ ...granted, expires_at: '2026-12-01T00:00:00Z', expired_credits: 0 })).not.toContain('value="promoVoid"')

  const voided = { ...granted, expires_at: '2026-12-01T00:00:00Z', voided_at: '2026-11-30T02:00:00Z', void_reason: '已手动收回' }
  const after = render(voided)
  expect(after).toContain(P.voided)
  expect(after).toContain(P.voidedAt)
  expect(after).toContain('已手动收回')
  expect(after).not.toContain('value="promoVoid"')
  expect(after).not.toContain(P.expiryOverdue)
})
