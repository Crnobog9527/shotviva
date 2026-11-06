import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STRIPE_TAX_CODE, priceCents } from './catalog'
import { createCheckout, type CheckoutDeps } from './checkout'
import type { StripeApi } from './client'
import { clearPriceCache } from './prices'
import { TEST_PRODUCTS, testProduct } from './test-products'

const USER = '00000000-0000-4000-8000-000000000001'

// A Price as scripts/stripe-setup.ts creates it, for the lookup key asked for.
function priceFor(key: string, overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  const recurring = key.endsWith('_recurring')
  const productId = key.replace(/_recurring$/, '')
  const product = testProduct(productId)
  return {
    id: `price_${key}`,
    lookup_key: key,
    currency: 'usd',
    unit_amount: priceCents(product),
    type: recurring ? 'recurring' : 'one_time',
    recurring: recurring && product.interval ? { interval: product.interval } : null,
    metadata: { product_id: productId },
    product: { id: 'prod', tax_code: STRIPE_TAX_CODE },
    ...overrides,
  } as Stripe.Price
}

// Like Stripe since 2026-09-30.endive: the session lists the methods it offers, i.e. the
// account's enabled methods filtered by allowed_payment_method_types. `enabled` is what the
// Dashboard has switched on; Managed Payments picks its own.
function fakeStripe(price: (key: string) => Stripe.Price = priceFor, enabled: readonly string[] = ['card', 'alipay', 'link']) {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
    if ('payment_method_types' in params) throw new Error('400: payment_method_types is no longer supported')
    const allowed = params.allowed_payment_method_types
    return {
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      payment_method_types: allowed ? enabled.filter((m) => (allowed as string[]).includes(m)) : ['card', 'link'],
      params,
    }
  })
  const list = vi.fn(async (params: Stripe.PriceListParams) => ({ data: (params.lookup_keys ?? []).map(price) }))
  const stripe = { checkout: { sessions: { create } }, prices: { list } } as unknown as StripeApi
  return { stripe, create, list }
}

function deps(stripe: StripeApi, overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return { stripe, products: TEST_PRODUCTS, managedPayments: true, origin: 'https://pr-1.example.app', returnToHosts: ['graylum.com'], trackStart: vi.fn(), ...overrides }
}

const sent = (create: ReturnType<typeof fakeStripe>['create']) => create.mock.calls[0]?.[0]

beforeEach(() => clearPriceCache())

describe('createCheckout routing', () => {
  it('opens a card membership as a Managed Payments subscription, with no method list', async () => {
    const { stripe, create } = fakeStripe()
    const d = deps(stripe)
    const result = await createCheckout(d, { userId: USER, body: { product_id: 'starter_monthly', method: 'card', locale: 'zh' } })

    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    const params = sent(create)
    expect(params).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_starter_monthly_recurring', quantity: 1 }],
      managed_payments: { enabled: true },
      client_reference_id: USER,
      locale: 'zh',
      metadata: { user_id: USER, product_id: 'starter_monthly', method: 'card' },
      subscription_data: { metadata: { user_id: USER, product_id: 'starter_monthly', method: 'card' } },
      success_url: 'https://pr-1.example.app/zh/account?checkout=success',
      cancel_url: 'https://pr-1.example.app/zh/pricing?checkout=cancelled',
    })
    expect(params).not.toHaveProperty('payment_method_types')
    expect(params).not.toHaveProperty('allowed_payment_method_types')
    expect(d.trackStart).toHaveBeenCalledWith(USER, {
      product_id: 'starter_monthly',
      tier: 'starter',
      interval: 'month',
      form: 'subscription',
      channel: 'stripe',
      method: 'card',
    }, 'zh')
  })

  it('opens Alipay as a one-time payment for one period, Shotviva as seller', async () => {
    const { stripe, create } = fakeStripe()
    const d = deps(stripe)
    await createCheckout(d, { userId: USER, body: { product_id: 'pro_yearly', method: 'alipay', locale: 'en' } })
    const params = sent(create)
    expect(params).toMatchObject({
      mode: 'payment',
      allowed_payment_method_types: ['alipay'],
      line_items: [{ price: 'price_pro_yearly' }],
      payment_intent_data: { metadata: { product_id: 'pro_yearly', method: 'alipay' } },
    })
    expect(params).not.toHaveProperty('managed_payments')
    expect(params).not.toHaveProperty('payment_method_types')
    expect(d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ form: 'one_time', method: 'alipay', interval: 'year' }), 'en')
  })

  it('sells a pack by card as a Managed Payments one-time payment', async () => {
    const { stripe, create } = fakeStripe()
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pack_s', method: 'card', locale: 'en' } })
    expect(sent(create)).toMatchObject({ mode: 'payment', managed_payments: { enabled: true }, line_items: [{ price: 'price_pack_s' }] })
  })

  it('uses a plain card checkout while Managed Payments is off', async () => {
    const { stripe, create } = fakeStripe()
    await createCheckout(deps(stripe, { managedPayments: false }), {
      userId: USER,
      body: { product_id: 'max_monthly', method: 'card', locale: 'en' },
    })
    expect(sent(create)).toMatchObject({ mode: 'subscription', allowed_payment_method_types: ['card'] })
    expect(sent(create)).not.toHaveProperty('managed_payments')
    expect(sent(create)).not.toHaveProperty('payment_method_types')
  })
})

describe('createCheckout with allowed_payment_method_types (API 2026-09-30.endive)', () => {
  it('sells an Alipay pack as a one-time payment limited to Alipay', async () => {
    const { stripe, create } = fakeStripe()
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pack_s', method: 'alipay', locale: 'zh' } })
    expect(sent(create)).toMatchObject({ mode: 'payment', allowed_payment_method_types: ['alipay'], locale: 'zh' })
  })

  it('refuses to send the buyer to a checkout that cannot take Alipay (off in the Dashboard)', async () => {
    const { stripe } = fakeStripe(priceFor, ['card', 'link'])
    const d = deps(stripe)
    await expect(
      createCheckout(d, { userId: USER, body: { product_id: 'starter_monthly', method: 'alipay', locale: 'en' } }),
    ).rejects.toThrow(/does not offer alipay/)
    expect(d.trackStart).not.toHaveBeenCalled()
  })

})

describe('createCheckout price checks', () => {
  it.each([
    ['amount', { unit_amount: 1890 }],
    ['metadata', { metadata: {} }],
    ['tax code', { product: { id: 'prod', tax_code: null } as unknown as Stripe.Product }],
  ])('refuses to sell when the Stripe Price disagrees with site.config (%s)', async (_, overrides) => {
    const { stripe, create } = fakeStripe((key) => priceFor(key, overrides))
    await expect(
      createCheckout(deps(stripe), { userId: USER, body: { product_id: 'starter_monthly', method: 'card', locale: 'en' } }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a missing Price with a pointer to the setup script', async () => {
    const { stripe } = fakeStripe()
    ;(stripe.prices.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [] })
    await expect(
      createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pack_m', method: 'card', locale: 'en' } }),
    ).rejects.toThrow(/stripe-setup/)
  })

  it('looks each Price up once per instance', async () => {
    const { stripe, list } = fakeStripe()
    const input = { userId: USER, body: { product_id: 'pack_l' as const, method: 'card' as const, locale: 'en' as const } }
    await createCheckout(deps(stripe), input)
    await createCheckout(deps(stripe), input)
    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith({ lookup_keys: ['pack_l'], active: true, expand: ['data.product'] })
  })
})

describe('success URL for a Graylum top-up (ARCHITECTURE §14.5)', () => {
  it('carries an allowlisted return_to and drops any other', async () => {
    const { stripe, create } = fakeStripe()
    const body = { product_id: 'pack_s' as const, method: 'card' as const, locale: 'en' as const }
    await createCheckout(deps(stripe), { userId: USER, body: { ...body, return_to: 'https://graylum.com/app?x=1' } })
    await createCheckout(deps(stripe), { userId: USER, body: { ...body, return_to: 'https://evil.example/app' } })
    expect(create.mock.calls[0]?.[0].success_url).toBe(
      'https://pr-1.example.app/account?checkout=success&from=graylum&return_to=https%3A%2F%2Fgraylum.com%2Fapp%3Fx%3D1',
    )
    expect(create.mock.calls[1]?.[0].success_url).toBe('https://pr-1.example.app/account?checkout=success')
  })
})
