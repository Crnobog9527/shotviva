import { describe, expect, it } from 'vitest'

import type { MembershipProduct, PackProduct } from '../../config'
import { compareForNeed } from './credit-compare'
import type { TierOffer } from './offer'

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

  it('has nothing to compare without a shortfall, packs or monthly plans', () => {
    expect(compareForNeed(0, packs, offers)).toBeNull()
    expect(compareForNeed(5, [], offers)).toBeNull()
    expect(compareForNeed(5, packs, [])).toBeNull()
  })
})
