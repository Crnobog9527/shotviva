import type Stripe from 'stripe'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCheckout } from './checkout'
import { methodOfCharge } from './payment-facts'
import { clearPriceCache } from './prices'
import { deps, fakeStripe, priceFor, sent, USER } from './test-checkout'

// T73 (ARCHITECTURE §6.3): the wallet line 支付宝 / 微信支付 opens one Stripe Checkout page that
// lists Alipay and WeChat Pay, and the buyer picks one there. Stripe filters the two against
// what the Dashboard has on: with one of them on the page shows that one, with neither it is
// refused. The payments row then records the wallet that paid.

beforeEach(() => clearPriceCache())

const wallet = (enabled: readonly string[]) => {
  const { stripe, create } = fakeStripe(priceFor, { enabled })
  return { d: deps(stripe), create }
}
const open = (d: ReturnType<typeof deps>, locale: 'en' | 'zh' = 'zh') =>
  createCheckout(d, { userId: USER, body: { product_id: 'starter_monthly', method: 'alipay', locale } })

describe('wallet line Session params', () => {
  it('asks for both wallets, WeChat Pay as a web client, on a one-time payment without Managed Payments', async () => {
    const { d, create } = wallet(['card', 'alipay', 'wechat_pay', 'link'])
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
    const { d } = wallet(enabled)
    await expect(open(d, 'en')).resolves.toEqual({ url: expect.any(String) })
    expect(d.trackStart).toHaveBeenCalledTimes(1)
  })

  it('refuses when neither wallet is on, and tracks nothing', async () => {
    const { d } = wallet(['card', 'link'])
    await expect(open(d)).rejects.toThrow(/offers none of alipay, wechat_pay/)
    expect(d.trackStart).not.toHaveBeenCalled()
  })

  it('leaves the card routes without payment_method_options', async () => {
    for (const method of ['card', 'cn_card'] as const) {
      const { d, create } = wallet(['card', 'alipay', 'wechat_pay'])
      await createCheckout(d, { userId: USER, body: { product_id: 'pack_s', method, locale: 'zh' } })
      expect(sent(create)).not.toHaveProperty('payment_method_options')
      expect(d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ method }), 'zh')
    }
  })
})

describe('recording the wallet that paid', () => {
  const charge = (type: string) => ({ id: 'ch_1', payment_method_details: { type } }) as unknown as Stripe.Charge

  it('records wechat_pay or alipay from the charge on the wallet line', () => {
    expect(methodOfCharge(charge('wechat_pay'), 'alipay')).toBe('wechat_pay')
    expect(methodOfCharge(charge('alipay'), 'alipay')).toBe('alipay')
  })

  it('falls back to the picked line when Stripe returned no charge', () => {
    expect(methodOfCharge(null, 'alipay')).toBe('alipay')
  })

  it('keeps card charges on their card route', () => {
    expect(methodOfCharge(charge('card'), 'cn_card')).toBe('cn_card')
    expect(methodOfCharge(charge('link'), 'card')).toBe('card')
  })
})
