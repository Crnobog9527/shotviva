import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PricingPayWith } from '@/core/billing/paywall'
import { BusinessSection } from '@/core/content/business'
import messages from '@/site/messages/en.json'

import { site } from '../site.config'
import { pricingPage } from './pricing'
import { zhPricingPage } from './zh/pricing'

const pages = { en: pricingPage, zh: zhPricingPage }

// /pricing as comps-v3-b pricing.html (T37): the H1 keeps the keyword first (建站规格 R3), and
// "For business" offers only what we arrange by hand (DESIGN §6.9 item 8).
describe('/pricing page copy', () => {
  it('starts the H1 with the keyword and italicises only an English tail', () => {
    expect(pricingPage.h1.startsWith('Shotviva Pricing')).toBe(true)
    expect(pricingPage.h1.endsWith(pricingPage.h1Em)).toBe(true)
    expect(pricingPage.h1Em).toBe('or buy credits once')
    expect(zhPricingPage.h1.startsWith('Shotviva 价格')).toBe(true)
    expect(zhPricingPage.h1Em).toBe('')
  })

  it.each(Object.entries(pages))('%s: six business items in the order DESIGN fixes, no price, SLA, SSO or seats', (_, page) => {
    const { business } = page
    expect(business.items).toHaveLength(6)
    const text = JSON.stringify(business)
    expect(text).not.toMatch(/\$\d|SLA|SSO|single sign-on|seat|team account|单点登录|团队账号|席位/i)
  })

  it('tags the order slip in each language', () => {
    expect(pricingPage.business.tag).toBe('Made to order')
    expect(zhPricingPage.business.tag).toBe('按需定制')
  })

  // T86 (Owner 2026-11-08): Contact us opens the inquiry dialog; no mailto and no "or write to"
  // line beside it. The dialog's code is not in the page until the button is used.
  it('opens the inquiry form instead of a mailto, with no address beside the button', () => {
    const actions = { submit: async () => ({ ok: true as const }), prefill: async () => ({ email: null, phone: null }) }
    for (const page of Object.values(pages)) {
      const html = renderToStaticMarkup(createElement(BusinessSection, { block: page.business, page: '/pricing', actions }))
      expect(html).toContain('aria-haspopup="dialog"')
      expect(html).toContain(page.business.cta)
      expect(html).not.toContain('mailto:')
      expect(html).not.toContain(site.brand.contactEmail)
      // The order slip (T43): the "Made to order" tag and the slip material.
      expect(html).toContain(page.business.tag)
      expect(html).toContain('biz-slip')
      for (const item of page.business.items) expect(html).toContain(item.title)
      expect(html).not.toContain(page.business.form.fields.message.label)
    }
  })

  it.each(Object.entries(pages))('%s: the form names every choice and says the reply comes within 2 business days', (_, page) => {
    const { form } = page.business
    for (const group of Object.values(form.choices)) for (const label of Object.values(group)) expect(label).not.toBe('')
    expect(form.success.body).toMatch(/2 business days|2 个工作日/)
    expect(form.consent.link.href).toBe('/privacy')
  })

  it('says the zh success line in the Owner\'s words', () => {
    expect(zhPricingPage.business.form.success.body).toBe('已收到，我们会在 2 个工作日内通过邮件联系你。')
  })
})

// DESIGN §4.5 and Stripe's merchant review: the renewal terms are on the page before purchase.
describe('/pricing "Pay with"', () => {
  // The provider's props typed in full, as home-faq.test.ts does: children is a required prop.
  const render = (channel: 'stripe' | 'waffo', wechatPay = false) => {
    const provider: ComponentProps<typeof NextIntlClientProvider> = { locale: 'en', messages, children: createElement(PricingPayWith, { channel, wechatPay }) }
    return renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
  }

  it('Stripe: card renews and can be cancelled, Alipay pays once, packs are one-time', () => {
    const html = render('stripe')
    expect(html).toContain('Card · Apple Pay · Google Pay')
    expect(html).toContain('Plans renew automatically, cancel anytime')
    expect(html).toContain('One-time payment for 30 days or 1 year, no auto-renew')
    expect(html).toContain('Credit packs are always a one-time payment.')
    expect(html).toContain('All prices in USD')
    // STRIPE_WECHAT_PAY off (default): the wallet row is Alipay alone, as before T73.
    expect(html).toContain('>Alipay<')
    expect(html).not.toMatch(/wechat/i)
  })

  it('Stripe with STRIPE_WECHAT_PAY on: the wallet row is "Alipay / WeChat Pay", terms unchanged (T73)', () => {
    const html = render('stripe', true)
    expect(html).toContain('Alipay / WeChat\u00a0Pay')
    expect(html).toContain('One-time payment for 30 days or 1 year, no auto-renew')
    // Waffo has no WeChat Pay, switch or not.
    expect(render('waffo', true)).not.toMatch(/wechat/i)
  })

  it('Waffo: the same terms (card plans renew since T50), the card group labelled "Card"', () => {
    const html = render('waffo')
    expect(html).toContain('Plans renew automatically, cancel anytime')
    expect(html).toContain('One-time payment for 30 days or 1 year, no auto-renew')
    expect(html).toContain('>Card<')
    expect(html).not.toContain('Apple Pay')
  })
})
