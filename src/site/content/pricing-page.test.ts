import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BusinessSection } from '@/core/content/business'

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

// Owner 2026-11-25: the English page has no "Pay with" block, as the Chinese one never had. Both
// heroes say prices are in USD; the methods and renewal terms are in the paywall (paywall-channel.test.ts).
describe('/pricing currency note', () => {
  it('says prices are in USD in both languages', () => {
    expect(pricingPage.currencyNote).toBe('All prices in USD.')
    expect(zhPricingPage.currencyNote).toBe('所有价格以美元计。')
  })
})
