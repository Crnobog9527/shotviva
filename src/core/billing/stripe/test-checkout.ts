import type Stripe from 'stripe'
import { vi } from 'vitest'

import { CARD_ONLY_CONFIG_NAME, STRIPE_TAX_CODE, priceCents } from './catalog'
import type { CheckoutDeps } from './checkout'
import type { StripeApi } from './client'
import { TEST_PRODUCTS, testProduct } from './test-products'

// Fixtures for the checkout tests: a fake of the Stripe calls createCheckout makes.

export const USER = '00000000-0000-4000-8000-000000000001'

// A Price as scripts/stripe-setup.ts creates it, for the lookup key asked for.
export function priceFor(key: string, overrides: Partial<Stripe.Price> = {}): Stripe.Price {
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

// The card-only configuration as scripts/stripe-setup.ts creates it.
export const CARD_ONLY_CONFIG = { id: 'pmc_card_only', name: CARD_ONLY_CONFIG_NAME, active: true }

type FakeOptions = { enabled?: readonly string[]; configs?: readonly { id: string; name: string; active: boolean }[] }

// Like Stripe since 2026-09-30.endive: the session lists the methods it offers, i.e. the
// account's enabled methods filtered by allowed_payment_method_types, or the card-only
// configuration's one method. `enabled` is what the Dashboard has switched on; Managed Payments
// picks its own. Stripe refuses both filters at once, and payment_method_types altogether.
export function fakeStripe(price: (key: string) => Stripe.Price = priceFor, options: FakeOptions = {}) {
  const enabled = options.enabled ?? ['card', 'alipay', 'link']
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
    if ('payment_method_types' in params) throw new Error('400: payment_method_types is no longer supported')
    const allowed = params.allowed_payment_method_types
    if (allowed && params.payment_method_configuration) throw new Error('400: only one of allowed_payment_method_types, payment_method_configuration')
    const offered = params.payment_method_configuration ? ['card'] : allowed ? enabled.filter((m) => (allowed as string[]).includes(m)) : ['card', 'link']
    return { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', payment_method_types: offered, params }
  })
  const list = vi.fn(async (params: Stripe.PriceListParams) => ({ data: (params.lookup_keys ?? []).map(price) }))
  const configs = vi.fn(async () => ({ data: options.configs ?? [] }))
  const stripe = { checkout: { sessions: { create } }, prices: { list }, paymentMethodConfigurations: { list: configs } } as unknown as StripeApi
  return { stripe, create, list, configs }
}

export function deps(stripe: StripeApi, overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return { stripe, products: TEST_PRODUCTS, managedPayments: true, termsConsent: false, origin: 'https://pr-1.example.app', returnToHosts: ['graylum.com'], trackStart: vi.fn(), ...overrides }
}

export const sent = (create: ReturnType<typeof fakeStripe>['create']) => create.mock.calls[0]?.[0]
