import type Stripe from 'stripe'
import { beforeEach, expect, it, vi } from 'vitest'

import { quoteMetadata } from '../checkout-price'
import { desiredPrices } from './catalog'
import { createCheckout } from './checkout'
import { fulfilCheckoutSession, readPurchase } from './fulfil'
import { clearPriceCache, matchesContractPrice } from './prices'
import { deps, fakeStripe, priceFor, sent, USER } from './test-checkout'
import { TEST_PRODUCTS, testProduct } from './test-products'

const pack = testProduct('pack_m')
const quote = { credits: 2490, cents: 2241, memberTier: 'pro' } as const
const form = { product_id: 'pack_m', method: 'card', locale: 'en' } as const
const key = 'pack_m_v2_pro'
const memberPrice = priceFor('pack_m', { id: 'price_member', lookup_key: key, unit_amount: 2241 })

beforeEach(clearPriceCache)

it('prepares separate immutable prices for all pack rates and both membership forms', () => {
  const legacy = desiredPrices(TEST_PRODUCTS)
  const prices = desiredPrices(TEST_PRODUCTS, 'v2')
  expect(new Set(prices.map(p => p.lookupKey)).size).toBe(21)
  expect(prices.filter(p => legacy.some(l => l.lookupKey === p.lookupKey))).toHaveLength(0)
  expect(prices.find(p => p.lookupKey === key)).toMatchObject({ productId: 'pack_m', unitAmount: 2241 })
})

it('charges the quoted Price without reserving a losing campaign code', async () => {
  const fake = fakeStripe(() => memberPrice)
  const d = deps(fake.stripe)
  await createCheckout(d, { userId: USER, body: form, quote, selectedCode: null })
  expect(d.codes.rpc).not.toHaveBeenCalled()
  expect(sent(fake.create)).toMatchObject({ line_items: [{ price: 'price_member', quantity: 1 }], metadata: quoteMetadata(quote) })
  expect(sent(fake.create)).not.toHaveProperty('discounts')
})

it('matches the authenticated checkout snapshot against the billed Price, quantity and version', () => {
  const session = { metadata: { user_id: USER, product_id: pack.id, method: 'card', ...quoteMetadata(quote) },
    client_reference_id: USER, mode: 'payment', line_items: { data: [{ quantity: 1, price: memberPrice }] } } as unknown as Stripe.Checkout.Session
  expect(readPurchase(session, TEST_PRODUCTS)).toMatchObject({ product: pack, quote })
  const corruptions: Stripe.Metadata[] = [{ pricing_version: 'future' }, { quoted_usd_cents: '2240' }, { pack_member_tier: 'max' }]
  for (const metadata of corruptions) {
    expect(() => readPurchase({ ...session, metadata: { ...session.metadata, ...metadata } }, TEST_PRODUCTS)).toThrow()
  }
  expect(() => readPurchase({ ...session, metadata: { user_id: USER, product_id: pack.id, method: 'card' } }, TEST_PRODUCTS)).toThrow()
})

it('recognizes a previously transferred legacy lookup key only on its archived fixed Stripe Product', () => {
  const archived = priceFor('pack_m', { lookup_key: null, active: false, product: 'shotviva_pack_m' })
  expect(matchesContractPrice(archived, pack, 'one_time')).toBe(true)
  expect(matchesContractPrice({ ...archived, product: 'other' }, pack, 'one_time')).toBe(false)
  expect(matchesContractPrice(archived, pack, 'one_time', quote)).toBe(false)
})

it('rejects a coupon whose terms changed between quote and reservation, before charging', async () => {
  const fake = fakeStripe(() => priceFor('pack_m', { lookup_key: 'pack_m_v2' }))
  const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'reserve_checkout_discount'
    ? { status: 'reserved', code_id: USER, code: 'SAVED', stripe_coupon_id: 'coupon', percent: 10, prepared: false } : null }))
  await expect(createCheckout(deps(fake.stripe, { codes: { rpc } }), { userId: USER, body: form,
    quote: { credits: 2490, cents: 2490, memberTier: null }, selectedCode: { code: 'SAVED', percent: 20 } })).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
  expect(rpc.mock.calls.map(c => c[0])).toEqual(['reserve_checkout_discount', 'release_checkout_discount'])
  expect(fake.create).not.toHaveBeenCalled()
})

it('settles the paid Stripe pack in cents, including tax, and tracks its snapped grant only once', async () => {
  const fake = fakeStripe()
  const session = { id: 'cs_purchase', metadata: { user_id: USER, product_id: pack.id, method: 'card', ...quoteMetadata(quote) },
    client_reference_id: USER, mode: 'payment', payment_status: 'paid', amount_total: 2400, amount_subtotal: 2241,
    currency: 'usd', total_details: { amount_tax: 159, amount_discount: 0 }, line_items: { data: [{ quantity: 1, price: memberPrice }] } }
  Object.assign(fake.stripe.checkout.sessions, { retrieve: vi.fn().mockResolvedValue(session) })
  let applied = true
  const rpc = vi.fn(async (name: string) => {
    if (name === 'record_payment_context') return { error: null, data: true }
    const data = { applied, credits: 2500, free_credits: 0, paid_until: null }
    applied = false
    return { error: null, data }
  })
  const dependencies = { products: TEST_PRODUCTS, stripe: fake.stripe, db: { rpc }, trackBuy: vi.fn(), applyCodes: vi.fn() }
  await expect(fulfilCheckoutSession(dependencies, session.id)).resolves.toBe('applied')
  await expect(fulfilCheckoutSession(dependencies, session.id)).resolves.toBe('replayed')
  expect(rpc).toHaveBeenCalledWith('settle_checkout_v2', expect.objectContaining({ p_session_id: 'cs_purchase', p_amount_total: 2400, p_amount_tax: 159 }))
  expect(dependencies.trackBuy).toHaveBeenCalledExactlyOnceWith(USER, expect.objectContaining({ credits: 2490, amount_usd: 22.41 }), 'en')
  expect(dependencies.applyCodes).toHaveBeenCalledWith(expect.objectContaining({ codeId: null, amountDiscount: 0 }))
})
