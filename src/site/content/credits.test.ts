import { describe, expect, it } from 'vitest'

import { FALLBACK_CREDITS, creditFacts, fillCredits, hasCreditMarkers } from './credits'
import { contentPagesIn, freeImagesIn, homePageIn, pricingFaqIn, pricingPageIn } from './localized'
import { FreeImagesLabel, FreeImagesShort, FreeImagesTitle, FromCredits, freeImagesLabel, fromCredits } from './offer'
import { zhFreeImages, zhFromCredits } from './zh/offer'

const priced = (credits: number) => ({ creditsCost: { '1k': credits, '2k': credits * 2, '4k': credits * 3 } })
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
    expect(fillCredits(fromCredits, FALLBACK_CREDITS)).toBe('credits as shown on the template')
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
  it('shows the signup grant even if the catalogue is empty or its price changes', () => {
    for (const facts of [MIXED, FALLBACK_CREDITS, { from: 74, same: true }]) {
      expect([freeImagesLabel, FreeImagesLabel, FreeImagesTitle, FreeImagesShort, zhFreeImages].map((label) => fillCredits(label, facts)))
        .toEqual(['100 free credits', '100 free credits', '100 Free Credits', '100 free credits', '100 个免费积分'])
    }
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
