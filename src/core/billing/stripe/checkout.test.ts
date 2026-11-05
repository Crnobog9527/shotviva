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

function fakeStripe(price: (key: string) => Stripe.Price = priceFor) {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    params,
  }))
  const list = vi.fn(async (params: Stripe.PriceListParams) => ({ data: (params.lookup_keys ?? []).map(price) }))
  const stripe = { checkout: { sessions: { create } }, prices: { list } } as unknown as StripeApi
  return { stripe, create, list }
}

function deps(stripe: StripeApi, overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return { stripe, products: TEST_PRODUCTS, managedPayments: true, origin: 'https://pr-1.example.app', trackStart: vi.fn(), ...overrides }
}

const sent = (create: ReturnType<typeof fakeStripe>['create']) => create.mock.calls[0]?.[0]

beforeEach(() => clearPriceCache())

describe('createCheckout routing', () => {
  it('opens a card membership as a Managed Payments subscription, no payment_method_types', async () => {
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
      success_url: 'https://pr-1.example.app/account?checkout=success',
      cancel_url: 'https://pr-1.example.app/pricing?checkout=cancelled',
    })
    expect(params).not.toHaveProperty('payment_method_types')
    expect(d.trackStart).toHaveBeenCalledWith(USER, {
      product_id: 'starter_monthly',
      tier: 'starter',
      interval: 'month',
      form: 'subscription',
      channel: 'stripe',
      method: 'card',
    })
  })

  it('opens Alipay as a one-time payment for one period, Shotviva as seller', async () => {
    const { stripe, create } = fakeStripe()
    const d = deps(stripe)
    await createCheckout(d, { userId: USER, body: { product_id: 'pro_yearly', method: 'alipay', locale: 'en' } })
    const params = sent(create)
    expect(params).toMatchObject({
      mode: 'payment',
      payment_method_types: ['alipay'],
      line_items: [{ price: 'price_pro_yearly' }],
      payment_intent_data: { metadata: { product_id: 'pro_yearly', method: 'alipay' } },
    })
    expect(params).not.toHaveProperty('managed_payments')
    expect(d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ form: 'one_time', method: 'alipay', interval: 'year' }))
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
    expect(sent(create)).toMatchObject({ mode: 'subscription', payment_method_types: ['card'] })
    expect(sent(create)).not.toHaveProperty('managed_payments')
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
