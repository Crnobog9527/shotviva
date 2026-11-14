import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '../../logger'
import { createCheckout } from './checkout'
import { methodOfPayment } from './payment-facts'
import { clearPriceCache } from './prices'
import { deps, fakeStripe, priceFor, sent, USER } from './test-checkout'

// T73 (ARCHITECTURE §6.3): with STRIPE_WECHAT_PAY on, the wallet line 支付宝 / 微信支付 opens one
// Stripe Checkout page that lists Alipay and WeChat Pay, and the buyer picks one there. Stripe
// filters the two against what the Dashboard has on: with one of them on the page shows that
// one, with neither it is refused. Off (the default), the line is the pre-T73 Alipay checkout,
// params and analytics included. The payments row records the wallet that paid.

beforeEach(() => clearPriceCache())

const wallet = (enabled: readonly string[], wechatPay: boolean) => {
  const { stripe, create } = fakeStripe(priceFor, { enabled })
  return { d: deps(stripe, { wechatPay }), create }
}
const open = (d: ReturnType<typeof deps>, locale: 'en' | 'zh' = 'zh') =>
  createCheckout(d, { userId: USER, body: { product_id: 'starter_monthly', method: 'alipay', locale } })

describe('STRIPE_WECHAT_PAY off (default): the pre-T73 Alipay checkout', () => {
  it('asks for Alipay alone, sends no payment_method_options and tracks alipay', async () => {
    const { d, create } = wallet(['card', 'alipay', 'wechat_pay', 'link'], false)
    await open(d)
    const params = sent(create)
    expect(params).toMatchObject({ mode: 'payment', allowed_payment_method_types: ['alipay'], managed_payments: { enabled: false } })
    expect(params).not.toHaveProperty('payment_method_options')
    expect(d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ channel: 'stripe', method: 'alipay' }), 'zh')
  })

  it('is the default when the deps say nothing else', async () => {
    const { stripe, create } = fakeStripe(priceFor, { enabled: ['alipay', 'wechat_pay'] })
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pack_s', method: 'alipay', locale: 'en' } })
    expect(sent(create)?.allowed_payment_method_types).toEqual(['alipay'])
  })

  it('still refuses when Alipay is off, even with WeChat Pay on in the Dashboard', async () => {
    const { d } = wallet(['card', 'wechat_pay'], false)
    await expect(open(d)).rejects.toThrow(/does not offer alipay/)
    expect(d.trackStart).not.toHaveBeenCalled()
  })
})

describe('STRIPE_WECHAT_PAY on: both wallets', () => {
  it('asks for both wallets, WeChat Pay as a web client, on a one-time payment without Managed Payments', async () => {
    const { d, create } = wallet(['card', 'alipay', 'wechat_pay', 'link'], true)
    await expect(open(d)).resolves.toEqual({ url: expect.stringContaining('checkout.stripe.com') })
    const params = sent(create)
    expect(params).toMatchObject({
      mode: 'payment',
      allowed_payment_method_types: ['alipay', 'wechat_pay'],
      payment_method_options: { wechat_pay: { client: 'web' } },
      managed_payments: { enabled: false },
      // The buyer's pick on the paywall stays `alipay` (the wallet line) in our own metadata.
      payment_intent_data: { metadata: { method: 'alipay', product_id: 'starter_monthly' } },
    })
    expect(params).not.toHaveProperty('payment_method_configuration')
    expect(params).not.toHaveProperty('wallet_options')
    expect(params).not.toHaveProperty('subscription_data')
    expect(d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ channel: 'stripe', method: 'alipay_or_wechat' }), 'zh')
  })

  it.each([
    ['only Alipay on', ['card', 'alipay']],
    ['only WeChat Pay on', ['card', 'wechat_pay']],
  ])('opens the checkout with %s', async (_, enabled) => {
    const { d } = wallet(enabled, true)
    await expect(open(d, 'en')).resolves.toEqual({ url: expect.any(String) })
    expect(d.trackStart).toHaveBeenCalledTimes(1)
  })

  it('refuses when neither wallet is on, and tracks nothing', async () => {
    const { d } = wallet(['card', 'link'], true)
    await expect(open(d)).rejects.toThrow(/offers none of alipay, wechat_pay/)
    expect(d.trackStart).not.toHaveBeenCalled()
  })
})

describe('card routes ignore the switch', () => {
  // 中国银行卡 carries its own 3DS option (T82) and never the WeChat one.
  it.each([false, true])('wechatPay %s: no WeChat options on card routes, the card method tracked', async (wechatPay) => {
    for (const method of ['card', 'cn_card'] as const) {
      const { d, create } = wallet(['card', 'alipay', 'wechat_pay'], wechatPay)
      await createCheckout(d, { userId: USER, body: { product_id: 'pack_s', method, locale: 'zh' } })
      if (method === 'card') expect(sent(create)).not.toHaveProperty('payment_method_options')
      else expect(sent(create)?.payment_method_options).toEqual({ card: { request_three_d_secure: 'any' } })
      expect(d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ method }), 'zh')
    }
  })
})

describe('recording the wallet that paid', () => {
  const charge = (type: string) => ({ id: 'ch_1', payment_method_details: { type } }) as unknown as Stripe.Charge
  const intent = (fields: { method?: string; types?: string[] }) =>
    ({
      id: 'pi_1',
      payment_method: fields.method ? { id: 'pm_1', type: fields.method } : null,
      payment_method_types: fields.types ?? [],
    }) as unknown as Stripe.PaymentIntent
  const evidence = (parts: { charge?: Stripe.Charge; intent?: Stripe.PaymentIntent }) => ({
    charge: parts.charge ?? null,
    intent: parts.intent ?? null,
    sessionId: 'cs_test_1',
  })

  it('records wechat_pay or alipay from the charge on the wallet line', () => {
    expect(methodOfPayment(evidence({ charge: charge('wechat_pay') }), 'alipay')).toBe('wechat_pay')
    expect(methodOfPayment(evidence({ charge: charge('alipay') }), 'alipay')).toBe('alipay')
  })

  it('without a charge, reads the PaymentIntent payment method type', () => {
    const paid = intent({ method: 'wechat_pay', types: ['alipay', 'wechat_pay'] })
    expect(methodOfPayment(evidence({ intent: paid }), 'alipay')).toBe('wechat_pay')
  })

  it('without a charge or payment method, an Alipay-only intent is Alipay', () => {
    expect(methodOfPayment(evidence({ intent: intent({ types: ['alipay'] }) }), 'alipay')).toBe('alipay')
  })

  it('falls back to the picked line with a warning only when both wallets were possible', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    expect(methodOfPayment(evidence({ intent: intent({ types: ['alipay', 'wechat_pay'] }) }), 'alipay')).toBe('alipay')
    expect(methodOfPayment(evidence({}), 'alipay')).toBe('alipay')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith('stripe.payment_method_unknown', expect.objectContaining({ session_id: 'cs_test_1' }))
    warn.mockRestore()
  })

  it('keeps card payments on their card route, without warnings', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    expect(methodOfPayment(evidence({ charge: charge('card') }), 'cn_card')).toBe('cn_card')
    expect(methodOfPayment(evidence({ charge: charge('link') }), 'card')).toBe('card')
    expect(methodOfPayment(evidence({}), 'cn_card')).toBe('cn_card')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
