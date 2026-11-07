import { beforeEach, describe, expect, it } from 'vitest'

import { clearCardOnlyCache } from './card-only'
import { createCheckout } from './checkout'
import { clearPriceCache } from './prices'
import { CARD_ONLY_CONFIG, deps, fakeStripe, sent, USER } from './test-checkout'

// T82 (ARCHITECTURE §6.3 「拒付申诉证据」): the session carries the buyer's IP and browser in its
// own metadata only, asks for the Terms box when the switch is on (custom text with both links,
// except on Managed Payments, which refuses custom_text), and 中国银行卡 always asks for 3DS.

beforeEach(() => {
  clearPriceCache()
  clearCardOnlyCache()
})

const client = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Test' }
const stripe = () => fakeStripe(undefined, { configs: [CARD_ONLY_CONFIG] })

describe('checkout evidence params', () => {
  it('puts the IP and browser on the session metadata, not on the subscription', async () => {
    const { stripe: s, create } = stripe()
    await createCheckout(deps(s), { userId: USER, body: { product_id: 'pro_monthly', method: 'card', locale: 'en' }, client })
    const params = sent(create)
    expect(params?.metadata).toMatchObject({ buyer_ip: '203.0.113.7', buyer_ua: 'Mozilla/5.0 Test' })
    expect(params?.subscription_data?.metadata).not.toHaveProperty('buyer_ip')
  })

  it('cuts a long user agent to Stripe’s 500 characters and leaves out what is unknown', async () => {
    const { stripe: s, create } = stripe()
    await createCheckout(deps(s), { userId: USER, body: { product_id: 'pack_s', method: 'card', locale: 'en' }, client: { ip: null, userAgent: 'x'.repeat(900) } })
    const meta = sent(create)?.metadata as Record<string, string>
    expect(meta.buyer_ua).toHaveLength(500)
    expect(meta).not.toHaveProperty('buyer_ip')
  })

  it('asks no consent while the switch is off, and no 3DS outside 中国银行卡', async () => {
    const { stripe: s, create } = stripe()
    await createCheckout(deps(s), { userId: USER, body: { product_id: 'pack_s', method: 'alipay', locale: 'en' }, client })
    expect(sent(create)).not.toHaveProperty('consent_collection')
    expect(sent(create)).not.toHaveProperty('payment_method_options')
  })

  it('中国银行卡 requires 3DS in subscription and payment mode', async () => {
    for (const product_id of ['starter_monthly', 'pack_m'] as const) {
      const { stripe: s, create } = stripe()
      await createCheckout(deps(s), { userId: USER, body: { product_id, method: 'cn_card', locale: 'zh' }, client })
      expect(sent(create)?.payment_method_options).toEqual({ card: { request_three_d_secure: 'any' } })
    }
  })

  it('with the switch on, plain routes get the Terms box with both links in the buyer’s language', async () => {
    const { stripe: s, create } = stripe()
    await createCheckout(deps(s, { termsConsent: true }), { userId: USER, body: { product_id: 'pack_s', method: 'cn_card', locale: 'zh' }, client })
    expect(sent(create)).toMatchObject({
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: { message: '我同意[服务条款](https://pr-1.example.app/zh/terms)和[退款政策](https://pr-1.example.app/zh/refund-policy)。' },
      },
    })
  })

  it('Managed Payments gets the Terms box without custom text', async () => {
    const { stripe: s, create } = stripe()
    await createCheckout(deps(s, { termsConsent: true }), { userId: USER, body: { product_id: 'pro_monthly', method: 'card', locale: 'en' }, client })
    expect(sent(create)).toMatchObject({ managed_payments: { enabled: true }, consent_collection: { terms_of_service: 'required' } })
    expect(sent(create)).not.toHaveProperty('custom_text')
  })
})
