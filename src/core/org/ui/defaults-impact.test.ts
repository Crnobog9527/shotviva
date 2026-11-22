import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useFormatter: () => ({ number: String }) }))

const { defaultsImpact } = await import('./defaults-panel')

const member = (paidFollows: boolean, promoFollows: boolean, unset: boolean) => ({
  userId: crypto.randomUUID(), account: null, role: 'member' as const, monthlyAllowance: 0, heldCredits: 0, promoAllowance: 0, heldPromoCredits: 0,
  paidFollowsDefault: paidFollows, promoFollowsDefault: promoFollows, paidUnset: unset, promoUnset: unset, customers: 0, joinedAt: '2026-11-01T00:00:00Z',
})

describe('defaultsImpact (the 保存默认 confirm)', () => {
  const data = { org: { promoPoolCredits: 1200 }, members: [member(true, true, true), member(true, true, false), member(false, false, false)] } as never
  it('counts who follows the changed default, who starts from 0, and caps the promotion draw at the pool', () => {
    expect(defaultsImpact(data, { promo: 500 })).toEqual({ paid: null, promo: { followers: 2, unset: 1, maxDraw: 1000 } })
    expect(defaultsImpact(data, { promo: 900 }).promo).toMatchObject({ maxDraw: 1200 })
    expect(defaultsImpact(data, { paid: 200 })).toEqual({ paid: { followers: 2, unset: 1 }, promo: null })
  })
})
