import { describe, expect, it } from 'vitest'

import type { MembershipTier } from '../config'
import { packPriceCents } from './pack-price'
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
