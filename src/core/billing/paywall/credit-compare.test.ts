import { describe, expect, it } from 'vitest'

import type { MembershipProduct, PackProduct } from '../../config'
import type { MemberStanding } from '../subscription/upgrade-rule'
import { compareForNeed, verdictKey } from './credit-compare'
import type { TierOffer } from './offer'
import { planStanding } from './standing-pick'

const pack = (id: string, credits: number, priceUsd: number) => ({ id, credits, priceUsd, tier: 'pack', interval: null, paidDays: null }) as unknown as PackProduct
const plan = (tier: 'starter' | 'pro' | 'max', credits: number, priceUsd: number) =>
  ({ id: `${tier}_monthly`, credits, priceUsd, tier, interval: 'month', paidDays: 30 }) as unknown as MembershipProduct
const packs = [pack('pack_l', 400, 129), pack('pack_s', 50, 9.9), pack('pack_m', 125, 47)]
const offers: TierOffer[] = [{ tier: 'starter', monthly: plan('starter', 50, 19.9) }, { tier: 'pro', monthly: plan('pro', 135, 49.9) }, { tier: 'max', monthly: plan('max', 300, 99) }]

describe('pack or plan when credits run out', () => {
  it('puts the smallest pack that covers the shortfall beside the cheapest plan that does', () => {
    expect(compareForNeed(20, packs, offers)).toMatchObject({ pack: { id: 'pack_s' }, plan: { id: 'starter_monthly' }, cheaperToday: 'pack', cheaperPerCredit: 'pack' })
    expect(compareForNeed(120, packs, offers)).toMatchObject({ pack: { id: 'pack_m' }, plan: { id: 'pro_monthly' }, cheaperToday: 'pack', cheaperPerCredit: 'plan' })
  })

  it('falls back to the largest of each when nothing covers it, and says when they cost the same', () => {
    expect(compareForNeed(900, packs, offers)).toMatchObject({ pack: { id: 'pack_l' }, plan: { id: 'max_monthly' } })
    expect(compareForNeed(10, [pack('p', 50, 19.9)], offers)).toMatchObject({ cheaperToday: 'same', cheaperPerCredit: 'same' })
  })

  it('has nothing to compare without a shortfall or packs, and no plan row without monthly plans', () => {
    expect(compareForNeed(0, packs, offers)).toBeNull()
    expect(compareForNeed(5, [], offers)).toBeNull()
    expect(compareForNeed(5, packs, [])).toMatchObject({ pack: { id: 'pack_s' }, plan: null })
  })

  it('offers a member only the plans they can buy, and the pack alone at the top', () => {
    const buyable = (standing: MemberStanding) => (tier: 'starter' | 'pro' | 'max') => planStanding(standing, tier, 'month').lock === null
    const pro: MemberStanding = { subscription: 'pro_monthly', tier: 'pro' }
    const max: MemberStanding = { subscription: 'max_monthly', tier: 'max' }
    // 20 short: Starter would cover it, but a Pro member can only move up to Max.
    expect(compareForNeed(20, packs, offers, buyable(pro))).toMatchObject({ pack: { id: 'pack_s' }, plan: { id: 'max_monthly' } })
    expect(compareForNeed(20, packs, offers, buyable(max))).toEqual({ pack: expect.objectContaining({ id: 'pack_s' }), plan: null })
  })

  it('words today and per credit apart whenever they differ, a tie included', () => {
    // Pack 990 for 9.90 against a 1,990-a-month plan at 19.90: cheaper today, the same per credit.
    const tie = compareForNeed(43, [pack('pack_s', 990, 9.9)], [{ tier: 'starter', monthly: plan('starter', 1990, 19.9) }])
    expect(tie).toMatchObject({ cheaperToday: 'pack', cheaperPerCredit: 'same' })
    expect(verdictKey(tie as Parameters<typeof verdictKey>[0])).toBe('packNowSameRate')
    expect(verdictKey({ cheaperToday: 'plan', cheaperPerCredit: 'same' })).toBe('planNowSameRate')
    expect(verdictKey({ cheaperToday: 'same', cheaperPerCredit: 'pack' })).toBe('sameNowPackRate')
    expect(verdictKey({ cheaperToday: 'same', cheaperPerCredit: 'plan' })).toBe('sameNowPlanRate')
    expect(verdictKey({ cheaperToday: 'pack', cheaperPerCredit: 'plan' })).toBe('packNowPlanLater')
    expect(verdictKey({ cheaperToday: 'plan', cheaperPerCredit: 'pack' })).toBe('planNowPackLater')
    expect(verdictKey({ cheaperToday: 'same', cheaperPerCredit: 'same' })).toBe('same')
  })
})
