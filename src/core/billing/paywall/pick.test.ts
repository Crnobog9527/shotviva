import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { packLooks, packOffers, tierOffers } from './offer'
import { checkoutTone, resolvePick, selectedProduct } from './pick'
import { DEFAULT_CHOICE, choiceFor } from './use-paywall-state'

const offers = tierOffers(TEST_PRODUCTS)
const packs = packOffers(TEST_PRODUCTS)

// The one-screen paywall (comps-v3-b paywall.html, T37): one pick among three tiers and three
// packs, preselected by whoever opened it.
describe('paywall pick', () => {
  // Monthly first (DESIGN §4.5 「默认显示按月」): a yearly default read as the monthly price.
  it('opens on Pro, Monthly, card by default', () => {
    expect(choiceFor()).toEqual(DEFAULT_CHOICE)
    expect(DEFAULT_CHOICE).toEqual({ period: 'month', pick: 'pro', method: 'card' })
  })

  // zh pages on Stripe list 中国银行卡 first, so it starts selected there (T64).
  it('starts on the first method the page lists', () => {
    expect(choiceFor({}, 'cn_card')).toEqual({ period: 'month', pick: 'pro', method: 'cn_card' })
    expect(choiceFor({ step: 'packs' }, 'cn_card')).toMatchObject({ pick: 'pack_m', method: 'cn_card' })
  })

  it('keeps the old entry points: a tier (account, batch rows, /pricing) or the packs', () => {
    expect(choiceFor({ step: 'period', tier: 'max' }).pick).toBe('max')
    expect(choiceFor({ tier: 'starter', period: 'month' })).toMatchObject({ pick: 'starter', period: 'month' })
    expect(choiceFor({ tier: 'max', period: 'year' })).toMatchObject({ pick: 'max', period: 'year' })
    expect(choiceFor({ step: 'packs', packId: 'pack_l' }).pick).toBe('pack_l')
    expect(choiceFor({ step: 'packs' }).pick).toBe('pack_m')
    expect(choiceFor({ packId: 'pack_s' }).pick).toBe('pack_s')
  })

  it('buys the tier at the chosen period, or the pack', () => {
    expect(resolvePick('pro', 'year', offers, packs)?.product.id).toBe('pro_yearly')
    expect(resolvePick('max', 'month', offers, packs)?.product.id).toBe('max_monthly')
    const pack = resolvePick('pack_m', 'year', offers, packs)
    expect(pack).toMatchObject({ kind: 'pack', product: { id: 'pack_m', credits: 55 } })
    expect(resolvePick('pack_x' as never, 'year', offers, packs)).toBeNull()
  })

  it('colours the checkout as the comp: Pro safelight, Max gold, Starter and packs bone', () => {
    const tone = (pick: Parameters<typeof resolvePick>[0]) => {
      const resolved = resolvePick(pick, 'year', offers, packs)
      return resolved ? checkoutTone(resolved) : null
    }
    expect([tone('starter'), tone('pro'), tone('max'), tone('pack_s'), tone('pack_l')]).toEqual(['bone', 'primary', 'gold', 'bone', 'bone'])
  })

  it('dresses the packs graphite / sapphire "Most popular" / gold "Best value" (lowest per credit)', () => {
    expect(packLooks(packs)).toEqual([
      { tone: 'graphite', flag: null },
      { tone: 'sapphire', flag: null },
      { tone: 'gold', flag: 'bestValue' },
    ])
    // "Best value" only while the largest really is the cheapest per credit.
    const [s, m, l] = packs
    if (!s || !m || !l) throw new Error('three packs')
    expect(packLooks([s, m, { ...l, priceUsd: 99 }])[2]).toEqual({ tone: 'gold', flag: null })
    expect(packLooks([s, m])).toEqual([
      { tone: 'graphite', flag: null },
      { tone: 'graphite', flag: null },
    ])
  })
})

// paywall_select (T74): the product a pick or a period switch lands on, with the shown method.
describe('selectedProduct', () => {
  const choice = { period: 'year', pick: 'pro', method: 'cn_card' } as const
  it('names the plan at the period, or the pack', () => {
    expect(selectedProduct(choice, { pick: 'max' }, offers, packs)).toEqual({ product_id: 'max_yearly', method: 'cn_card' })
    expect(selectedProduct(choice, { period: 'month' }, offers, packs)).toEqual({ product_id: 'pro_monthly', method: 'cn_card' })
    expect(selectedProduct(choice, { pick: 'pack_s' }, offers, packs)).toEqual({ product_id: 'pack_s', method: 'cn_card' })
  })
})
