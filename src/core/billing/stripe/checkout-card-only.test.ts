import { beforeEach, describe, expect, it } from 'vitest'

import { clearCardOnlyCache } from './card-only'
import { CARD_ONLY_CONFIG_NAME, CARD_ONLY_PREFERENCES, cardOnlyDrift } from './catalog'
import { createCheckout } from './checkout'
import { clearPriceCache } from './prices'
import { CARD_ONLY_CONFIG, deps, fakeStripe, sent, USER } from './test-checkout'

// 中国银行卡 (T64, ARCHITECTURE §6.3), fixed after Codex's run on #249: the plain card route must
// show the card form only (no Link with its bank / Klarna buttons, no Apple Pay / Google Pay),
// while the Managed Payments card and Alipay stay as they were. Adaptive Pricing is left to the
// Dashboard (Owner 2026-11-08: the buyer may see their own currency; Shotviva is paid in USD).

beforeEach(() => {
  clearPriceCache()
  clearCardOnlyCache()
})

const withConfig = () => fakeStripe(undefined, { configs: [{ id: 'pmc_default', name: 'Default', active: true }, CARD_ONLY_CONFIG] })

describe('createCheckout 中国银行卡 session params', () => {
  it('opens a Starter monthly on the card-only configuration: no MP, no Link, zh, no tax', async () => {
    const { stripe, create } = withConfig()
    const d = deps(stripe)
    await createCheckout(d, { userId: USER, body: { product_id: 'starter_monthly', method: 'cn_card', locale: 'zh' } })
    const params = sent(create)
    expect(params).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_starter_monthly_recurring', quantity: 1 }],
      managed_payments: { enabled: false },
      payment_method_configuration: 'pmc_card_only',
      wallet_options: { link: { display: 'never' } },
      locale: 'zh',
      metadata: { user_id: USER, product_id: 'starter_monthly', method: 'cn_card', locale: 'zh' },
      subscription_data: { metadata: { method: 'cn_card' } },
      success_url: 'https://pr-1.example.app/zh/checkout?session_id={CHECKOUT_SESSION_ID}',
    })
    // Stripe takes one filter or the other, never both.
    expect(params).not.toHaveProperty('allowed_payment_method_types')
    expect(params).not.toHaveProperty('automatic_tax')
    // Local-currency display stays as the Dashboard sets it (Owner 2026-11-08).
    expect(params).not.toHaveProperty('adaptive_pricing')
    expect(d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ form: 'subscription', method: 'cn_card' }), 'zh')
  })

  it('sells a pack the same way, as a one-time payment', async () => {
    const { stripe, create } = withConfig()
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pack_m', method: 'cn_card', locale: 'zh' } })
    expect(sent(create)).toMatchObject({
      mode: 'payment',
      line_items: [{ price: 'price_pack_m' }],
      payment_method_configuration: 'pmc_card_only',
      wallet_options: { link: { display: 'never' } },
      payment_intent_data: { metadata: { product_id: 'pack_m', method: 'cn_card' } },
    })
  })

  it('without the configuration still filters to card and turns Link off', async () => {
    const { stripe, create } = fakeStripe()
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pack_s', method: 'cn_card', locale: 'zh' } })
    const params = sent(create)
    expect(params).toMatchObject({ allowed_payment_method_types: ['card'], wallet_options: { link: { display: 'never' } } })
    expect(params).not.toHaveProperty('payment_method_configuration')
  })

  it('finds the configuration once per instance, and ignores an archived one', async () => {
    const archived = fakeStripe(undefined, { configs: [{ ...CARD_ONLY_CONFIG, active: false }] })
    await createCheckout(deps(archived.stripe), { userId: USER, body: { product_id: 'pack_s', method: 'cn_card', locale: 'zh' } })
    expect(sent(archived.create)).not.toHaveProperty('payment_method_configuration')

    const { stripe, configs } = withConfig()
    for (const id of ['pack_s', 'pack_m'] as const) await createCheckout(deps(stripe), { userId: USER, body: { product_id: id, method: 'cn_card', locale: 'zh' } })
    expect(configs).toHaveBeenCalledTimes(1)
  })

  it('gives the pre-approval card fallback (MP off) the same card-only checkout', async () => {
    const { stripe, create } = withConfig()
    await createCheckout(deps(stripe, { managedPayments: false }), { userId: USER, body: { product_id: 'max_monthly', method: 'card', locale: 'en' } })
    expect(sent(create)).toMatchObject({ managed_payments: { enabled: false }, payment_method_configuration: 'pmc_card_only' })
  })
})

describe('the other routes are untouched', () => {
  it('the Managed Payments card sends MP only: no configuration, Link or pricing override', async () => {
    const { stripe, create, configs } = withConfig()
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pro_monthly', method: 'card', locale: 'zh' } })
    expect(sent(create)).toEqual(expect.objectContaining({ managed_payments: { enabled: true } }))
    for (const key of ['allowed_payment_method_types', 'payment_method_configuration', 'wallet_options', 'adaptive_pricing']) {
      expect(sent(create)).not.toHaveProperty(key)
    }
    expect(configs).not.toHaveBeenCalled()
  })

  it('the wallet line keeps its own filter and no card-only settings', async () => {
    const { stripe, create } = withConfig()
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pack_l', method: 'alipay', locale: 'zh' } })
    expect(sent(create)).toMatchObject({ allowed_payment_method_types: ['alipay', 'wechat_pay'], managed_payments: { enabled: false } })
    expect(sent(create)).not.toHaveProperty('payment_method_configuration')
    expect(sent(create)).not.toHaveProperty('wallet_options')
  })
})

describe('card-only configuration (scripts/stripe-setup.ts)', () => {
  it('is card on; Link, Apple Pay and Google Pay off', () => {
    expect(CARD_ONLY_PREFERENCES).toEqual({ card: 'on', apple_pay: 'off', google_pay: 'off', link: 'off' })
    expect(CARD_ONLY_CONFIG_NAME).toBe('Shotviva card only (T64)')
  })

  it('names what drifted', () => {
    expect(cardOnlyDrift({ card: 'on', apple_pay: 'off', google_pay: 'off', link: 'off' })).toEqual([])
    expect(cardOnlyDrift({ card: 'on', apple_pay: 'on', google_pay: 'off', link: null })).toEqual(['apple_pay', 'link'])
  })
})
