import { describe, expect, it } from 'vitest'

import type { MembershipTier } from '../config'
import { bestPackOffer, packPriceCents } from './pack-price'
import { testProduct } from './stripe/test-products'

describe('pre-tax pack price in cents', () => {
  const tiers: (MembershipTier | null)[] = [null, 'starter', 'pro', 'max']
  it.each([
    ['pack_s', [990, 990, 990, 990]],
    ['pack_m', [2490, 2366, 2241, 2117]],
    ['pack_l', [4990, 4741, 4491, 4242]],
  ] as const)('%s, including exact half cents', (id, expected) => {
    expect(tiers.map(tier => packPriceCents(testProduct(id), tier))).toEqual(expected)
  })

  // Revisions saved from migration 1610 on carry their own rate (2026-11-21: 100 / 95 / 90).
  it.each([
    ['pack_m', [2490, 2490, 2366, 2241]],
    ['pack_l', [4990, 4990, 4741, 4491]],
  ] as const)('%s at the revision\'s own member rate', (id, expected) => {
    const product = { ...testProduct(id), packMemberPayPct: { starter: 100, pro: 95, max: 90 } }
    expect(tiers.map(tier => packPriceCents(product, tier))).toEqual(expected)
  })
})

it('compares both offers against the original price, preserving a code on a tie', () => {
  const pack = testProduct('pack_m')
  expect(bestPackOffer(pack, 'pro', 5)).toEqual({ cents: 2241, useCode: false })
  expect(bestPackOffer(pack, 'pro', 10)).toEqual({ cents: 2241, useCode: false })
  expect(bestPackOffer(pack, 'pro', 20)).toEqual({ cents: 1992, useCode: true })
  expect(bestPackOffer(pack, 'starter', 5)).toEqual({ cents: 2365, useCode: true })
})
