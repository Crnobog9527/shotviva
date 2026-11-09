import { expect, it, vi } from 'vitest'

import { invoiceObject, subscriptionObject } from '../../../../tests/db/stripe-fixtures'
import { quoteMetadata } from '../checkout-price'
import { renewFromInvoice } from './renewal'
import type { StripeApi } from './client'
import { priceFor, USER } from './test-checkout'
import { testProduct } from './test-products'

const product = { ...testProduct('max_yearly'), priceUsd: 891, credits: 168000 }
const quote = { credits: 168000, cents: 89100, memberTier: null }

it('settles the immutable annual invoice using its original contract even after the subscription changes', async () => {
  const original = subscriptionObject({ periodEndDays: 365, userId: USER, productId: 'max_yearly' })
  Object.assign(original.metadata, quoteMetadata(quote))
  const invoice = invoiceObject({ subscription: original, amountPaid: 89700, tax: 600, periodEndDays: 365 })
  Object.assign(invoice.lines.data[0]!, { quantity: 1, pricing: { price_details: { price: 'price_v2_contract' } } })
  const current = subscriptionObject({ periodEndDays: 30, userId: USER, productId: 'pro_monthly' })
  const oldPrice = priceFor('max_yearly_recurring', { unit_amount: 89100, lookup_key: 'max_yearly_recurring_v2' })
  const stripe = { prices: { retrieve: vi.fn().mockResolvedValue(oldPrice) }, subscriptions: { retrieve: vi.fn().mockResolvedValue(current) },
    invoices: { retrieve: vi.fn().mockResolvedValue(invoice) } }
  const settled = { applied: true, credits: 168100, free_credits: 0, paid_until: null }
  const rpc = vi.fn().mockResolvedValueOnce({ error: null, data: settled }).mockResolvedValue({ error: null, data: { ...settled, applied: false } })
  const deps = { stripe: stripe as unknown as StripeApi, db: { rpc }, products: [product], trackBuy: vi.fn(), applyCodes: vi.fn() }
  await expect(renewFromInvoice(deps, invoice.id)).resolves.toBe('applied')
  await expect(renewFromInvoice(deps, invoice.id)).resolves.toBe('replayed')
  expect(stripe.prices.retrieve).toHaveBeenCalledWith('price_v2_contract')
  expect(rpc).toHaveBeenCalledWith('apply_subscription_renewal_v2', expect.objectContaining({ p_product_id: 'max_yearly', p_invoice_id: invoice.id, p_amount_total: 89700, p_amount_tax: 600 }))
  expect(deps.trackBuy).toHaveBeenCalledExactlyOnceWith(USER, expect.objectContaining({ amount_usd: 891, credits: 168000 }), 'en')
})
