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
})

it('compares both offers against the original price, preserving a code on a tie', () => {
  const pack = testProduct('pack_m')
  expect(bestPackOffer(pack, 'pro', 5)).toEqual({ cents: 2241, useCode: false })
  expect(bestPackOffer(pack, 'pro', 10)).toEqual({ cents: 2241, useCode: false })
  expect(bestPackOffer(pack, 'pro', 20)).toEqual({ cents: 1992, useCode: true })
  expect(bestPackOffer(pack, 'starter', 5)).toEqual({ cents: 2365, useCode: true })
})
