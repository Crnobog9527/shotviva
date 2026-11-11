import type Stripe from 'stripe'
import { expect, it, vi } from 'vitest'
import { finishStripe } from '../catalog-attempt'
import type { StripeApi } from './client'
import { sessionContract } from './catalog-session'
import { netUsd } from './contract-price'
import { priceFor, USER } from './test-checkout'

const token = '19e7df16-7e20-4f29-b099-9df339a21bbd'
const session = () =>
  ({
    id: 'cs_signed',
    amount_total: 1990,
    amount_subtotal: 1990,
    currency: 'usd',
    client_reference_id: USER,
    subscription: null,
    mode: 'payment',
    metadata: {
      pricing_version: 'v2',
      product_id: 'pack_s',
      catalog_revision: '3',
      catalog_attempt: token,
      catalog_price: 'price_archived',
      quoted_usd_cents: '1990',
      quoted_credits: '1234',
      user_id: USER,
      pack_member_tier: 'none',
    },
    line_items: {
      has_more: false,
      data: [
        {
          quantity: 1,
          price: priceFor('pack_s', {
            id: 'price_archived',
            product: 'shotviva_pack_s',
            unit_amount: 1990,
            lookup_key: null,
            active: false,
          }),
        },
      ],
    },
  }) as unknown as Stripe.Checkout.Session

it('accepts an archived exact Price with an obsolete key and issues no grant for a different Price at the same amount', async () => {
  const terms = { id: 'pack_s', priceUsd: 19.9, credits: 1234, tier: 'pack', interval: null, paidDays: null }
  const rpc = vi.fn(async () => ({ data: terms, error: null }))
  const payment = session()
  expect(await sessionContract({ rpc }, payment, [], false)).toEqual(terms)
  expect(rpc).toHaveBeenCalledWith(
    'catalog_receipt',
    expect.objectContaining({
      p_price: 'price_archived',
      p_revision: 3,
      p_ref: payment.id,
      p_net: 1990,
      p_record: false,
    }),
  )
  rpc.mockClear()
  payment.line_items!.data[0]!.price!.id = 'price_replacement'
  await expect(sessionContract({ rpc }, payment, [], true)).rejects.toThrow('Billed price differs')
  expect(rpc).not.toHaveBeenCalled()
})

it('recovers an open provider session by its persisted ID and never reopens a paid one', async () => {
  const create = vi.fn()
  const retrieve = vi
    .fn()
    .mockResolvedValueOnce({ status: 'open', url: 'https://checkout.stripe.com/test', payment_method_types: ['card'] })
    .mockResolvedValueOnce({ status: 'complete', url: null })
  const stripe = { checkout: { sessions: { create, retrieve } } } as unknown as StripeApi
  const saved = {
    session_id: 'cs_test',
    session_url: 'https://checkout.stripe.com/test',
    params: { allowed_payment_method_types: ['card'] },
  }
  const db = { rpc: vi.fn() }
  expect(await finishStripe(db, stripe, USER, token, saved)).toEqual({ url: saved.session_url })
  await expect(finishStripe(db, stripe, USER, token, saved)).rejects.toThrow('closed')
  expect(create).not.toHaveBeenCalled()
  expect(db.rpc).not.toHaveBeenCalled()
})

it('checks converted coupon charges using local minor units, including zero-decimal currencies', () => {
  expect(netUsd(2490, 88, 0, 103, 'jpy', '15')).toBe(2116)
  expect(() => netUsd(2490, 87, 0, 103, 'jpy', '15')).toThrow()
  expect(netUsd(2490, 2216, 100, 2490, 'usd', '15')).toBe(2116)
})
