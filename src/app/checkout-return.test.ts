import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PendingReturn, SuccessReturn, returnView, type CheckoutFacts } from '@/core/billing/checkout-return'
import type { Locale } from '@/core/i18n'
import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

// The checkout return page in both languages (T43, ARCHITECTURE §17): every product renders
// with real messages, no key falls through, and the payment terms match the purchase.
async function render(locale: Locale, element: ReactElement) {
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: site.locales.zhPaths, children: element }
  const provider: ComponentProps<typeof NextIntlClientProvider> = {
    locale,
    messages: await loadMessages(locale),
    timeZone: 'UTC',
    children: createElement(TranslatedPathsProvider, paths),
  }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, provider)).replace(/&#x27;/g, "'")
}

const facts = (productId: CheckoutFacts['productId'], overrides: Partial<CheckoutFacts> = {}): CheckoutFacts => ({
  productId,
  settled: true,
  abandoned: false,
  method: 'card',
  amount: { minor: 4990, currency: 'usd' },
  card: { brand: 'visa', last4: '4242' },
  receiptUrl: 'https://pay.stripe.com/receipts/r1',
  recurring: !productId.startsWith('pack'),
  paymentKey: 'cs_test_r1',
  renewsAt: productId.startsWith('pack') ? null : '2026-12-06T00:00:00.000Z',
  ...overrides,
})
const balance = { paid: 135, free: 3 }

async function success(locale: Locale, id: CheckoutFacts['productId'], overrides: Partial<CheckoutFacts> = {}) {
  const product = site.billing.products.find((p) => p.id === id)
  if (!product) throw new Error(id)
  const view = returnView(facts(id, overrides), product, balance)
  if (view.state !== 'success') throw new Error('expected success')
  return render(locale, createElement(SuccessReturn, { view, back: null }))
}

describe('checkout return page (en)', () => {
  it('a monthly plan: title, credits, renewal, card, receipt, renewal terms', async () => {
    const html = await success('en', 'pro_monthly')
    expect(html).toContain("You're on Pro")
    expect(html).toContain('135 credits are in your account. Make something.')
    expect(html).toContain('+135')
    expect(html).toContain('138')
    expect(html).toContain('Dec 6, 2026 · $49.90')
    expect(html).toContain('$49.90 · Visa ···· 4242')
    expect(html).toContain('href="https://pay.stripe.com/receipts/r1"')
    expect(html).toContain('Renews automatically. Cancel anytime from Account.')
  })

  it('yearly, pack and a one-period Alipay plan say what they are', async () => {
    expect(await success('en', 'max_yearly')).toContain('A year of credits, all in your account now.')
    const pack = await success('en', 'pack_l', { method: 'alipay', card: null, receiptUrl: null })
    expect(pack).toContain('115 credits added')
    expect(pack).toContain('One-time payment. Nothing renews.')
    expect(pack).not.toContain('Renews')
    expect(pack).toContain('· Alipay')
    expect(await success('en', 'starter_monthly', { method: 'alipay', card: null, recurring: false, renewsAt: null })).toContain('One-time payment for 30 days. Nothing renews')
  })

  it('pending: confirming, the order and amount, check again', async () => {
    const product = site.billing.products.find((p) => p.id === 'pro_monthly')
    if (!product) throw new Error('pro_monthly')
    const view = returnView(facts('pro_monthly', { settled: false, method: 'alipay' }), product, balance)
    if (view.state !== 'pending') throw new Error('expected pending')
    const html = await render('en', createElement(PendingReturn, { view, again: '/checkout?session_id=cs_test_x', email: 'support@shotviva.com' }))
    expect(html).toContain('Confirming your payment')
    expect(html).toContain('Alipay is still confirming it.')
    expect(html).toContain('Pro · 1 month · 135 credits')
    expect(html).toContain('Check again')
    expect(html).toContain('support@shotviva.com')
  })
})

describe('checkout return page, celebration hooks (T55)', () => {
  it('Pro and Max plates carry their material; Starter and packs the plain card', async () => {
    expect(await success('en', 'pro_monthly')).toContain('data-material="pro"')
    expect(await success('en', 'max_yearly')).toContain('data-material="max"')
    for (const id of ['starter_monthly', 'pack_l'] as const) expect(await success('en', id)).not.toContain('data-material')
  })

  it('marks the tick, the title and the added credits for the plate moments; renders no particles on the server', async () => {
    const html = await success('en', 'pro_monthly')
    expect(html).toContain('data-return-plate=""')
    expect(html).toContain('data-glyph=""')
    expect(html).toContain('data-title=""')
    expect(html).toContain('data-celebrate-added="135">+135')
    expect(html).not.toContain('<canvas')
  })
})

describe('checkout return page (zh)', () => {
  it.each(site.billing.products.map((p) => p.id))('%s renders in Chinese without missing keys', async (id) => {
    const html = await success('zh', id)
    expect(html).not.toMatch(/app\.checkout\.|paywall\./)
    expect(html).toMatch(/积分/)
    expect(html).toContain('开始创作')
  })

  it('names the plan and the method in Chinese', async () => {
    expect(await success('zh', 'max_monthly')).toContain('你已开通旗舰版')
    expect(await success('zh', 'pack_s', { method: 'alipay', card: null })).toContain('· 支付宝')
  })
})
