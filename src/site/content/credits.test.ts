import { describe, expect, it } from 'vitest'

import { FALLBACK_FROM_CREDITS, fillCredits, hasCreditMarkers, startingCredits } from './credits'
import { contentPagesIn, homePageIn, pricingFaqIn, pricingPageIn } from './localized'
import { FromCredits, fromCredits } from './offer'
import { zhFromCredits } from './zh/offer'

const priced = (credits: number) => ({ creditsCost: { '1k': credits, '2k': credits * 2, '3k': credits * 3 } })

// 建站规格 G4 (gap audit A1): "from N credits" is the cheapest published web template's
// Standard price, never a number typed into the copy.
describe('from N credits', () => {
  it('is the lowest Standard price among the published templates', () => {
    expect(startingCredits([priced(4), priced(1), priced(2)])).toBe(1)
    expect(startingCredits([priced(2)])).toBe(2)
  })

  it('falls back to the standard template price with no catalogue', () => {
    expect(startingCredits([])).toBe(FALLBACK_FROM_CREDITS)
    expect(FALLBACK_FROM_CREDITS).toBe(2)
  })

  it('fills the markers in both languages, singular for 1', () => {
    const copy = { a: `costs ${fromCredits}.`, b: [`${FromCredits} (Standard)`], c: { d: `每张${zhFromCredits}。` }, n: 3 }
    expect(fillCredits(copy, 1)).toEqual({ a: 'costs from 1 credit.', b: ['From 1 credit (Standard)'], c: { d: '每张1 积分起。' }, n: 3 })
    expect(fillCredits(copy, 2).a).toBe('costs from 2 credits.')
  })

  it('leaves no marker on any marketing page once filled', () => {
    for (const locale of ['en', 'zh'] as const) {
      const pages = [homePageIn(locale), pricingPageIn(locale), pricingFaqIn(locale, 'stripe'), pricingFaqIn(locale, 'waffo'), ...contentPagesIn(locale)]
      for (const page of pages) {
        const filled = JSON.stringify(fillCredits(page, 1))
        expect(hasCreditMarkers(filled)).toBe(false)
        expect(filled).not.toMatch(/⟦|⟧/)
      }
    }
  })

  it('never puts a marker where llms.txt and the sitemaps read without filling (titles, descriptions, answers)', () => {
    for (const locale of ['en', 'zh'] as const) {
      for (const page of [homePageIn(locale), pricingPageIn(locale), ...contentPagesIn(locale)]) {
        const unfilled = [page.title, page.description, 'answerBlock' in page ? page.answerBlock : '', page.label].join(' ')
        expect(hasCreditMarkers(unfilled)).toBe(false)
      }
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
