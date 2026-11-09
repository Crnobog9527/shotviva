import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, expect, it, vi } from 'vitest'

import { assertPricingVersions, buyerQuote } from './buyer-quote'
import { readPendingDiscount } from '../codes/read'
import { currentTier } from './tier'
import { testProduct } from './stripe/test-products'

vi.mock('../codes/read', () => ({ readPendingDiscount: vi.fn() }))
vi.mock('./tier', () => ({ currentTier: vi.fn() }))

const admin = {} as SupabaseClient
const body = { product_id: 'pack_m', method: 'card', locale: 'en' } as const
const quote = (channel: 'waffo' | 'stripe', cents: number) =>
  buyerQuote(admin, 'buyer', { ...testProduct('pack_m'), credits: 2490 }, { ...body, expected_price_cents: cents }, channel)

function availableCode(percent: number) {
  return { code: 'SAVED', percent, products: ['pack_m'], duration: 'once' as const, months: null, expiresAt: '2100-01-01T00:00:00Z' }
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(currentTier).mockResolvedValue('pro') })

it('reads the effective tier, re-prices after expiry, and refuses a stale displayed amount', async () => {
  vi.mocked(readPendingDiscount).mockResolvedValue(null)
  await expect(quote('stripe', 2241)).resolves.toEqual({ price: { credits: 2490, memberTier: 'pro', cents: 2241 }, selectedCode: null })
  vi.mocked(currentTier).mockResolvedValue(null)
  await expect(quote('stripe', 2241)).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
  await expect(quote('stripe', 2490)).resolves.toMatchObject({ price: { credits: 2490, memberTier: null, cents: 2490 } })
})

it('preserves tied and losing codes, reserving only the code that beats the member rate', async () => {
  for (const percent of [5, 10]) {
    vi.mocked(readPendingDiscount).mockResolvedValue(availableCode(percent))
    expect((await quote('stripe', 2241)).selectedCode).toBeNull()
  }
  vi.mocked(readPendingDiscount).mockResolvedValue(availableCode(20))
  expect(await quote('stripe', 1992)).toEqual({ price: { credits: 2490, memberTier: null, cents: 2490 }, selectedCode: { code: 'SAVED', percent: 20 } })
  await expect(quote('stripe', 1793)).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
})

it('Waffo offers only the effective membership price', async () => {
  await expect(quote('waffo', 2241)).resolves.toMatchObject({ price: { cents: 2241 }, selectedCode: null })
  expect(readPendingDiscount).not.toHaveBeenCalled()
})


it('requires the page, build and database catalog to agree while accepting unversioned v1 tabs on v1 only', () => {
  expect(() => assertPricingVersions(undefined, undefined, undefined)).not.toThrow()
  expect(() => assertPricingVersions('v2', 'v2', 'v2')).not.toThrow()
  for (const tag of [undefined, 'v1'] as const) expect(() => assertPricingVersions('v2', 'v2', tag)).toThrow()
  expect(() => assertPricingVersions(undefined, undefined, 'v2')).toThrow()
  expect(() => assertPricingVersions('v2', undefined, 'v2')).toThrow()
})

it('validates every displayed annual price including the exact amount after an eligible campaign', async () => {
  const plan = { ...testProduct('max_yearly'), priceUsd: 891, credits: 168000 }
  const start = (cents?: number, channel: 'stripe' | 'waffo' = 'stripe') => buyerQuote(admin, 'buyer', plan, {
    product_id: 'max_yearly', method: 'card', locale: 'en', pricing_version: 'v2', expected_price_cents: cents,
  }, channel)
  vi.mocked(readPendingDiscount).mockResolvedValue(null)
  await expect(start()).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
  await expect(start(71300)).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
  await expect(start(89100)).resolves.toMatchObject({ price: { cents: 89100 }, selectedCode: null })
  vi.mocked(readPendingDiscount).mockResolvedValue({ ...availableCode(20), products: ['max_yearly'] })
  await expect(start(89100)).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
  await expect(start(71280)).resolves.toMatchObject({ price: { cents: 89100 }, selectedCode: { code: 'SAVED', percent: 20 } })
  await expect(start(89100, 'waffo')).resolves.toMatchObject({ selectedCode: null })
})
