import { beforeEach, expect, it, vi } from 'vitest'

import { invoiceObject, subscriptionObject } from '../../../../tests/db/stripe-fixtures'
import { notifyOwner } from '../../alerts'
import { quoteMetadata } from '../checkout-price'
import type { StripeApi } from './client'
import { fulfilCheckoutSession } from './fulfil'
import { renewFromInvoice } from './renewal'
import { fakeStripe, priceFor, USER } from './test-checkout'
import { TEST_PRODUCTS, testProduct } from './test-products'

vi.mock('../../alerts', () => ({ notifyOwner: vi.fn() }))
beforeEach(() => vi.mocked(notifyOwner).mockClear())

// The Owner hears of a Stripe payment once: on the call that granted, never on a replay.
it('first purchase: one alert per Checkout Session, however many events or retries settle it', async () => {
  const quote = { credits: 2490, cents: 2241, memberTier: 'pro' } as const
  const fake = fakeStripe()
  const session = { id: 'cs_purchase', metadata: { user_id: USER, product_id: 'pack_m', method: 'card', ...quoteMetadata(quote) },
    client_reference_id: USER, mode: 'payment', payment_status: 'paid', amount_total: 2400, amount_subtotal: 2241,
    currency: 'usd', total_details: { amount_tax: 159, amount_discount: 0 },
    line_items: { data: [{ quantity: 1, price: priceFor('pack_m', { id: 'price_member', lookup_key: 'pack_m_v2_pro', unit_amount: 2241 }) }] } }
  Object.assign(fake.stripe.checkout.sessions, { retrieve: vi.fn().mockResolvedValue(session) })
  let applied = true
  const rpc = vi.fn(async (name: string) => {
    if (name === 'record_payment_context') return { error: null, data: true }
    const data = { applied, credits: 2500, free_credits: 0, paid_until: null }
    applied = false
    return { error: null, data }
  })
  const deps = { products: TEST_PRODUCTS, stripe: fake.stripe, db: { rpc }, trackBuy: vi.fn(), applyCodes: vi.fn() }
  for (let i = 0; i < 3; i += 1) await fulfilCheckoutSession(deps, session.id)
  expect(notifyOwner).toHaveBeenCalledExactlyOnceWith({ kind: 'payment_received', channel: 'stripe', ref: 'cs_purchase', userId: USER,
    productId: 'pack_m', amount: { cents: 2400, currency: 'usd' }, method: 'card', renewal: false })
})

it('an unpaid session alerts nothing', async () => {
  const fake = fakeStripe()
  Object.assign(fake.stripe.checkout.sessions, { retrieve: vi.fn().mockResolvedValue({ id: 'cs_x', payment_status: 'unpaid' }) })
  const deps = { products: TEST_PRODUCTS, stripe: fake.stripe, db: { rpc: vi.fn() }, applyCodes: vi.fn() }
  await expect(fulfilCheckoutSession(deps, 'cs_x')).resolves.toBe('unpaid')
  expect(notifyOwner).not.toHaveBeenCalled()
})

it('renewal: one alert per invoice, marked as a renewal; a replayed or ignored invoice alerts nothing', async () => {
  const sub = subscriptionObject({ periodEndDays: 30, userId: USER, productId: 'starter_monthly' })
  const invoice = invoiceObject({ subscription: sub, amountPaid: 1990, tax: 0, periodEndDays: 30 })
  const price = priceFor('starter_monthly', { lookup_key: 'starter_monthly_recurring' })
  Object.assign(invoice.lines.data[0]!, { quantity: 1, pricing: { price_details: { price: price.id } } })
  const stripe = { prices: { retrieve: vi.fn().mockResolvedValue(price) }, subscriptions: { retrieve: vi.fn().mockResolvedValue(sub) },
    invoices: { retrieve: vi.fn().mockResolvedValue(invoice) } }
  const settled = { applied: true, credits: 1, free_credits: 0, paid_until: null }
  const rpc = vi.fn().mockResolvedValueOnce({ error: null, data: settled }).mockResolvedValue({ error: null, data: { ...settled, applied: false } })
  const deps = { stripe: stripe as unknown as StripeApi, db: { rpc }, products: [testProduct('starter_monthly')], trackBuy: vi.fn(), applyCodes: vi.fn() }
  await expect(renewFromInvoice(deps, invoice.id)).resolves.toBe('applied')
  await expect(renewFromInvoice(deps, invoice.id)).resolves.toBe('replayed')
  expect(notifyOwner).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'payment_received', channel: 'stripe', ref: invoice.id,
    userId: USER, productId: 'starter_monthly', amount: { cents: 1990, currency: invoice.currency }, renewal: true }))

  vi.mocked(notifyOwner).mockClear()
  stripe.invoices.retrieve.mockResolvedValue({ ...invoice, billing_reason: 'subscription_create' })
  await expect(renewFromInvoice(deps, invoice.id)).resolves.toBe('ignored')
  expect(notifyOwner).not.toHaveBeenCalled()
})
