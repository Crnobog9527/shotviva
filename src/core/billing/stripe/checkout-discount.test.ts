import type Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'

import type { CheckoutBody } from './checkout'
import { createCheckout } from './checkout'
import { checkoutToken, discountedCancelSession, expireAndRelease } from './checkout-discount'
import { deps, fakeStripe, USER } from './test-checkout'

const token = '1e1b00f8-eaa9-4b82-a558-5a1072d922aa'
const codeId = '558f255c-4718-41fa-a38c-5247c18cdbf2'
const deadline = Math.ceil(Date.now() / 1000) + 1805
const claim = { status: 'reserved', code_id: codeId, code: 'QA20', stripe_coupon_id: 'T94coupon', percent: 20, prepared: false }
const sessionMeta = { checkout_token: token, code: 'QA20', code_id: codeId, user_id: USER }
const pack = { product_id: 'pack_s', method: 'card', locale: 'en' } as const

function setup(reservation: unknown = claim, managedPayments = true) {
  const fake = fakeStripe()
  const create = vi.fn(async (p: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => ({
    status: 'open', id: 'cs_test_123', url: 'https://checkout.stripe.test/test', expires_at: p.expires_at,
    metadata: p.metadata, payment_method_types: ['card', 'alipay', 'wechat_pay'], idempotency: options.idempotencyKey,
  }))
  const retrieve = vi.fn()
  const expire = vi.fn().mockResolvedValue({ status: 'expired' })
  Object.assign(fake.stripe.checkout.sessions, { create, retrieve, expire })
  const rpc = vi.fn(async (name: string) => {
    if (name === 'reserve_checkout_discount') return { data: reservation, error: null }
    if (name === 'prepare_checkout_discount') return { data: { status: 'prepared', expires_at: deadline }, error: null }
    if (name === 'release_checkout_discount') return { data: true, error: null }
    throw new Error(name)
  })
  const d = deps(fake.stripe, { codes: { rpc }, managedPayments, wechatPay: true })
  const start = (body: CheckoutBody = pack) => createCheckout(d, { userId: USER, body, token })
  return { d, rpc, create, expire, retrieve, start }
}

describe('Stripe checkout with a reserved campaign discount', () => {
  it.each([
    ['starter_monthly', 'card', true], ['pack_s', 'card', true], ['starter_monthly', 'card', false],
    ['starter_monthly', 'cn_card', true], ['pro_monthly', 'alipay', true],
  ] as const)('adds server-selected coupon, exact deadline and stable metadata on %s/%s (MP %s)', async (product_id, method, mp) => {
    const c = setup(claim, mp)
    const body = { product_id, method, locale: 'zh' } as const
    expect(await c.start(body)).toMatchObject({ cancelReceipt: token + ':cs_test_123' })
    const [params, options] = c.create.mock.calls[0]
    expect(options).toEqual({ idempotencyKey: token })
    expect(params).toMatchObject({ metadata: sessionMeta, expires_at: deadline, discounts: [{ coupon: 'T94coupon' }],
      cancel_url: expect.stringContaining('c=' + token) })
    expect(params).not.toHaveProperty('allow_promotion_codes')
    if (params.mode === 'subscription') expect(params.subscription_data?.metadata).toMatchObject({ code: 'QA20', code_id: codeId })
    expect(c.d.trackStart).toHaveBeenCalledWith(USER, expect.objectContaining({ code: 'QA20', discount_percent: 20 }), 'zh')
    await c.start(body)
    expect(c.create.mock.calls[1]).toEqual(c.create.mock.calls[0])
  })

  it('sends the regular price without coupon metadata, expiry or cancellation receipt when none is eligible', async () => {
    const c = setup(null)
    expect(await c.start()).toEqual({ url: 'https://checkout.stripe.test/test' })
    const params = c.create.mock.calls[0][0]
    expect(params).not.toHaveProperty('discounts')
    expect(params).not.toHaveProperty('expires_at')
    expect(params.metadata).not.toHaveProperty('code_id')
    expect(c.rpc).toHaveBeenCalledTimes(1)
  })

})

describe('discount reservation, retries and failure handling', () => {
  it.each(['expired', 'in_use'])('blocks a %s reservation without creating a session at the full price', async (status) => {
    const c = setup({ status })
    await expect(c.start()).rejects.toMatchObject({ status: 409 })
    expect(c.create).not.toHaveBeenCalled()
  })

  it.each([null, claim])('refuses a stale displayed offer before preparing a session', async (slot) => {
    const c = setup(slot)
    await expect(c.start({ ...pack, expected_code: 'STALE20' })).rejects.toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
    expect(c.create).not.toHaveBeenCalled()
    expect(c.rpc.mock.calls.some(([name]) => name === 'prepare_checkout_discount')).toBe(false)
    expect(c.rpc.mock.calls.some(([name]) => name === 'release_checkout_discount')).toBe(slot !== null)
  })

  it.each([
    ['StripeInvalidRequestError', 400, false, true], ['StripeInvalidRequestError', 400, true, false],
    ['StripeIdempotencyError', 400, false, false], ['StripeAPIError', 500, false, false], ['StripeConnectionError', 0, false, false],
  ] as const)('handles %s/%i (previously prepared %s): releases %s', async (type, statusCode, prepared, released) => {
    const c = setup({ ...claim, prepared })
    c.create.mockRejectedValueOnce({ type, statusCode })
    await expect(c.start()).rejects.toBeTruthy()
    expect(c.rpc.mock.calls.some(([name]) => name === 'release_checkout_discount')).toBe(released)
  })

  it('rejects a Session with the wrong deadline and closes it before releasing its discount', async () => {
    const c = setup()
    c.create.mockResolvedValueOnce({ status: 'open', id: 'cs_test_123', url: 'url', expires_at: deadline + 100,
      metadata: sessionMeta, payment_method_types: ['card'], idempotency: token })
    await expect(c.start()).rejects.toThrow('deadline differs')
    expect(c.expire).toHaveBeenCalledWith('cs_test_123')
    expect(c.rpc).toHaveBeenCalledWith('release_checkout_discount', { p_user: USER, p_token: token })
  })

  it.each(['complete', 'expired'])('does not redirect a retry to a previously %s Session', async (status) => {
    const c = setup({ ...claim, prepared: true })
    c.retrieve.mockResolvedValueOnce({ status, id: 'cs_test_123', url: 'obsolete', expires_at: deadline,
      metadata: sessionMeta, payment_method_types: ['card'] })
    await expect(c.start()).rejects.toMatchObject({ status: 409 })
    expect(c.retrieve).toHaveBeenCalledWith('cs_test_123')
    expect(c.expire).not.toHaveBeenCalled()
    expect(c.rpc.mock.calls.some(([name]) => name === 'release_checkout_discount')).toBe(status === 'expired')
  })
})

function checkoutSession(status: 'open' | 'complete' | 'expired', metadata = sessionMeta) {
  return { id: 'cs_test_123', metadata, status, payment_status: 'unpaid' }
}

describe('return from abandoned Stripe Checkout', () => {
  it('requires the matching buyer, cancellation nonce, and trusted Stripe metadata', async () => {
    expect(discountedCancelSession(token + ':cs_test_123', token)).toBe('cs_test_123')
    expect(discountedCancelSession(token + ':cs_test_123', USER)).toBeNull()
    expect(discountedCancelSession('garbage', token)).toBeNull()
    const c = setup()
    await expireAndRelease(c.d.stripe, c.d.codes, USER, token, checkoutSession('open', { ...sessionMeta, user_id: codeId }))
    await expireAndRelease(c.d.stripe, c.d.codes, USER, codeId, checkoutSession('open'))
    expect(c.expire).not.toHaveBeenCalled()
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it('releases only after Stripe confirms expiration; submitted unpaid async payments retain their claim', async () => {
    const c = setup()
    c.expire.mockRejectedValueOnce(new Error('raced with payment'))
    c.retrieve.mockResolvedValueOnce(checkoutSession('complete'))
    await expireAndRelease(c.d.stripe, c.d.codes, USER, token, checkoutSession('open'))
    await expireAndRelease(c.d.stripe, c.d.codes, USER, token, checkoutSession('complete'))
    expect(c.rpc).not.toHaveBeenCalled()
    await expireAndRelease(c.d.stripe, c.d.codes, USER, token, checkoutSession('expired'))
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith('release_checkout_discount', { p_user: USER, p_token: token })
  })
})

it('derives idempotency keys per account and purchase, still accepting deployed callers without a nonce', () => {
  const original = checkoutToken(USER, pack, token)
  expect(checkoutToken(USER, { ...pack }, token)).toBe(original)
  expect(checkoutToken(codeId, pack, token)).not.toBe(original)
  expect(checkoutToken(USER, { ...pack, product_id: 'pack_l' }, token)).not.toBe(original)
  expect(checkoutToken(USER, { ...pack, method: 'alipay' }, token)).not.toBe(original)
  expect(checkoutToken(USER, pack, null)).not.toBe(checkoutToken(USER, pack, null))
  expect(() => checkoutToken(USER, pack, 'hello')).toThrow('Invalid checkout attempt')
})
