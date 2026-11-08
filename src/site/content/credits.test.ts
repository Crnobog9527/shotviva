import { describe, expect, it } from 'vitest'

import { FALLBACK_CREDITS, creditFacts, fillCredits, hasCreditMarkers, withCatalogueTiers } from './credits'
import { contentPagesIn, freeImagesIn, homePageIn, pricingFaqIn, pricingPageIn } from './localized'
import { FreeImagesLabel, FreeImagesShort, FreeImagesTitle, FromCredits, freeImagesLabel, fromCredits, menuCostUsd, menuCredits, photosLeftAfterMenu, photosLeftInPlan, setCostUsd, setCredits } from './offer'
import { zhFreeImages, zhFromCredits } from './zh/offer'

const priced = (credits: number) => ({ creditsCost: { '1k': credits, '2k': credits * 2, '3k': credits * 3 } })
const MIXED = { from: 1, same: false }

// 建站规格 G3, G4 (gap audit A1, T91): "from N credits" and every count of images are the
// cheapest published web template's Standard price, never a number typed into the copy.
describe('from N credits', () => {
  it('is the lowest Standard price among the published templates, and says whether all cost that', () => {
    expect(creditFacts([priced(4), priced(1), priced(2)])).toEqual({ from: 1, same: false })
    expect(creditFacts([priced(1), priced(1)])).toEqual({ from: 1, same: true })
    expect(creditFacts([priced(2)])).toEqual({ from: 2, same: true })
  })

  it('falls back to the standard template price with no catalogue', () => {
    expect(creditFacts([])).toBe(FALLBACK_CREDITS)
    expect(FALLBACK_CREDITS).toEqual({ from: 2, same: true })
  })

  it('fills the markers in both languages, singular for 1', () => {
    const copy = { a: `costs ${fromCredits}.`, b: [`${FromCredits} (Standard)`], c: { d: `每张${zhFromCredits}。` }, n: 3 }
    expect(fillCredits(copy, MIXED)).toEqual({ a: 'costs from 1 credit.', b: ['From 1 credit (Standard)'], c: { d: '每张1 积分起。' }, n: 3 })
    expect(fillCredits(copy, { from: 2, same: true }).a).toBe('costs from 2 credits.')
  })

  it('leaves no marker on any marketing page once filled', () => {
    for (const locale of ['en', 'zh'] as const) {
      const pages = [homePageIn(locale), pricingPageIn(locale), pricingFaqIn(locale, 'stripe'), pricingFaqIn(locale, 'waffo'), ...contentPagesIn(locale), freeImagesIn(locale)]
      for (const page of pages) {
        const filled = JSON.stringify(fillCredits(page, MIXED))
        expect(hasCreditMarkers(filled)).toBe(false)
        expect(filled).not.toMatch(/⟦|⟧/)
      }
    }
  })

  it('never puts a marker in a title or label (read unfilled for breadcrumbs and links)', () => {
    for (const locale of ['en', 'zh'] as const) {
      for (const page of [homePageIn(locale), pricingPageIn(locale), ...contentPagesIn(locale)]) {
        expect(hasCreditMarkers(`${page.title} ${page.label}`)).toBe(false)
      }
    }
  })
})

// T91: the signup gift and the bills count Standard images at the catalogue's cheapest price.
describe('image counts from the catalogue', () => {
  it('counts the 6 free credits in Standard images, "up to" only when templates cost different amounts', () => {
    const free = [freeImagesLabel, FreeImagesLabel, FreeImagesTitle, FreeImagesShort, zhFreeImages]
    expect(free.map((marker) => fillCredits(marker, MIXED))).toEqual([
      'up to 6 free Standard images',
      'Up to 6 free Standard images',
      'Up to 6 Free Standard Images',
      'Up to 6 free images',
      '最多 6 张免费标准图',
    ])
    expect(free.map((marker) => fillCredits(marker, { from: 1, same: true }))).toEqual([
      '6 free Standard images',
      '6 free Standard images',
      '6 Free Standard Images',
      '6 free images',
      '6 张免费标准图',
    ])
    // No catalogue: the pre-T91 numbers.
    expect(fillCredits(freeImagesLabel, FALLBACK_CREDITS)).toBe('3 free Standard images')
    expect(fillCredits(zhFreeImages, FALLBACK_CREDITS)).toBe('3 张免费标准图')
    expect(fillCredits(FreeImagesTitle, { from: 6, same: true })).toBe('1 Free Standard Image')
    // 「最多」 is a Chinese word: no space before it, a space before a bare number.
    expect(fillCredits(`新用户送 ${zhFreeImages}。`, MIXED)).toBe('新用户送最多 6 张免费标准图。')
    expect(fillCredits(`新用户送 ${zhFreeImages}。`, FALLBACK_CREDITS)).toBe('新用户送 3 张免费标准图。')
    expect(JSON.stringify(fillCredits(homePageIn('zh'), MIXED))).not.toMatch(/[一-鿿] 最多/)
  })

  it('prices the home set and the menu at N credits a photo, Starter at $0.40 a credit', () => {
    const bills = [setCredits, setCostUsd, photosLeftInPlan, menuCredits, menuCostUsd, photosLeftAfterMenu]
    // 3 × 1 credit = $1.20, (50 − 3) ÷ 1 = 47 left; 10 × 1 = $4, (50 − 10) ÷ 1 = 40 left.
    expect(bills.map((marker) => fillCredits(marker, MIXED))).toEqual(['3', '$1.20', '47', '10', '$4', '40'])
    // At 2 credits a photo: the pre-T91 bills.
    expect(bills.map((marker) => fillCredits(marker, FALLBACK_CREDITS))).toEqual(['6', '$2.40', '22', '20', '$8', '15'])
  })
})

describe('what a credit buys on /pricing', () => {
  it('shows the most common price per resolution, the config numbers with no catalogue', () => {
    const block = pricingPageIn('en').creditBuys
    const live = [priced(1), priced(1), priced(2), priced(4)]
    expect(withCatalogueTiers(block, live).tiers).toEqual([
      { name: 'Standard', credits: 1 },
      { name: 'HD', credits: 2 },
      { name: 'Max', credits: 3 },
    ])
    // A tie goes to the cheaper price.
    expect(withCatalogueTiers(block, [priced(2), priced(1)]).tiers.map((tier) => tier.credits)).toEqual([1, 2, 3])
    expect(withCatalogueTiers(block, []).tiers.map((tier) => tier.credits)).toEqual([2, 4, 6])
    expect([block.unit, block.unitOne]).toEqual(['credits', 'credit'])
    expect(withCatalogueTiers(pricingPageIn('zh').creditBuys, live).tiers.map((tier) => tier.name)).toEqual(['标准', '高清', '超清'])
  })
})

// T73: the zh Alipay answer names WeChat Pay only with STRIPE_WECHAT_PAY on, on Stripe.
describe('pricing FAQ and STRIPE_WECHAT_PAY', () => {
  const wallet = (faq: readonly { question: string; answer: string }[]) => faq.find((item) => item.question.includes('支付宝'))
  it('off (default): the pre-T73 Alipay answer', () => {
    expect(wallet(pricingFaqIn('zh', 'stripe'))).toMatchObject({ question: '能用支付宝付款吗？' })
    expect(JSON.stringify(pricingFaqIn('zh', 'stripe', false))).not.toContain('微信')
  })
  it('on: the WeChat Pay answer on Stripe, never on Waffo, never in English', () => {
    expect(wallet(pricingFaqIn('zh', 'stripe', true))).toMatchObject({ question: '能用支付宝或微信支付付款吗？' })
    expect(wallet(pricingFaqIn('zh', 'stripe', true))?.answer).toContain('在结账页再选其中一种')
    expect(JSON.stringify(pricingFaqIn('zh', 'waffo', true))).not.toContain('微信')
    expect(JSON.stringify(pricingFaqIn('en', 'stripe', true))).not.toMatch(/wechat/i)
    expect(pricingFaqIn('zh', 'stripe', true)).toHaveLength(pricingFaqIn('zh', 'stripe').length)
  })
})
