import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), createCheckout: vi.fn(), createWaffoCheckout: vi.fn(), channel: vi.fn(), mirror: vi.fn(), tier: vi.fn(), pricing: vi.fn() }))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('@/core/billing/subscription/read-summary', () => ({ readMirrorRows: mocks.mirror }))
vi.mock('@/core/billing/active-pricing', async () => {
  const { site } = await import('@/site/site.config')
  const { configuredPricing } = await import('@/core/billing/checkout-price')
  mocks.pricing.mockResolvedValue(configuredPricing(site.billing))
  return { readActivePricing: mocks.pricing }
})
vi.mock('@/core/codes/read', () => ({ readPendingDiscount: vi.fn(async () => null) }))
vi.mock('@/core/billing/tier', () => ({ currentTier: mocks.tier }))
vi.mock('@/core/billing/stripe', async (original) => ({
  ...(await original<typeof import('@/core/billing/stripe')>()),
  stripeClient: () => ({}),
  managedPaymentsEnabled: () => false,
  createCheckout: mocks.createCheckout,
}))
vi.mock('@/core/billing/waffo', () => ({
  paymentChannel: mocks.channel,
  waffoClient: () => ({}),
  waffoConfig: () => ({ productIds: {}, subscriptionProductIds: {} }),
  createWaffoCheckout: mocks.createWaffoCheckout,
}))

const { POST } = await import('./route')

const ORIGIN = 'http://localhost:3000'
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', verified: true, banned: false }
const request = (productId = 'pack_s', method = 'card', locale?: 'en' | 'zh') =>
  new NextRequest(`${ORIGIN}/api/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ product_id: productId, method, ...(locale ? { locale } : {}) }),
  })
const liveRow = (status: string, cancelAtPeriodEnd = false) => ({
  provider: 'stripe',
  stripeSubscriptionId: 'sub_1',
  waffoOrderId: null,
  productId: 'starter_monthly',
  status,
  currentPeriodEnd: new Date('2026-12-06T00:00:00Z'),
  cancelAtPeriodEnd,
})

// ARCHITECTURE §7 (T25): a banned account keeps signing in but cannot start a checkout.
describe('POST /api/checkout', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset()
    mocks.createCheckout.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })
    mocks.createWaffoCheckout.mockReset().mockResolvedValue({ url: 'https://pay.waffo.test/c/1' })
    mocks.channel.mockReset().mockReturnValue('stripe')
    mocks.mirror.mockReset().mockResolvedValue([])
    mocks.tier.mockReset().mockResolvedValue(null)
  })

  it('creates a session for a normal account', async () => {
    mocks.getSessionUser.mockResolvedValue(USER)
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.createCheckout).toHaveBeenCalledOnce()
  })

  it('keeps the discounted-session cancellation receipt in an HttpOnly cookie only', async () => {
    mocks.getSessionUser.mockResolvedValue(USER)
    const receipt = '1e1b00f8-eaa9-4b82-a558-5a1072d922aa:cs_test_one'
    mocks.createCheckout.mockResolvedValueOnce({ url: 'https://checkout.stripe.test/1', cancelReceipt: receipt })
    const response = await POST(request())
    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.test/1' })
    expect(response.cookies.get('sv_code_checkout')).toMatchObject({ value: receipt, path: '/api/checkout/cancel',
      httpOnly: true, secure: true, sameSite: 'lax' })
  })

  it.each(['stripe', 'waffo'])('answers 403 for a banned account on the %s channel', async (channel) => {
    mocks.channel.mockReturnValue(channel)
    mocks.getSessionUser.mockResolvedValue({ ...USER, banned: true })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
    expect(mocks.createWaffoCheckout).not.toHaveBeenCalled()
  })

})

// Upgrades only (ARCHITECTURE §6.2 「升级」, T66).
function resetMember() {
  mocks.createCheckout.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })
  mocks.createWaffoCheckout.mockReset().mockResolvedValue({ url: 'https://pay.waffo.test/c/1' })
  mocks.channel.mockReset().mockReturnValue('stripe')
  mocks.mirror.mockReset().mockResolvedValue([])
  mocks.tier.mockReset().mockResolvedValue(null)
  mocks.getSessionUser.mockReset()
}

describe('POST /api/checkout for a member', () => {
  beforeEach(resetMember)

  // The same or a lower plan while a Starter: the same or a lower plan while a Starter
  // monthly subscription runs (renewing, cancelling or past due) answers 409.
  it.each([
    ['active', false],
    ['active', true],
    ['past_due', false],
  ])('answers 409 DOWNGRADE_NOT_ALLOWED for the same plan while a %s subscription runs (cancelling: %s)', async (status, cancelling) => {
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([liveRow(status, cancelling)])
    for (const [product, method, locale] of [['starter_monthly', 'card'], ['starter_monthly', 'alipay'], ['starter_monthly', 'cn_card', 'zh']] as const) {
      const response = await POST(request(product, method, locale))
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'DOWNGRADE_NOT_ALLOWED' })
    }
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('answers 409 for a lower plan: Pro → Starter', async () => {
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([{ ...liveRow('active'), productId: 'pro_monthly' }])
    mocks.tier.mockResolvedValue('pro')
    expect((await POST(request('starter_yearly'))).status).toBe(409)
    expect((await POST(request('pro_monthly'))).status).toBe(409)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it.each([
    ['pro_monthly', 'card', undefined],
    ['starter_yearly', 'card', undefined],
    ['max_yearly', 'alipay', undefined],
    ['pro_yearly', 'cn_card', 'zh'],
  ] as const)('lets a Starter monthly member upgrade to %s by %s at full price', async (product, method, locale) => {
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([liveRow('active')])
    mocks.tier.mockResolvedValue('starter')
    expect((await POST(request(product, method, locale))).status).toBe(200)
    expect(mocks.createCheckout).toHaveBeenCalledOnce()
  })

  it('a one-time Starter period (Alipay) can upgrade to Pro and renew Starter', async () => {
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.tier.mockResolvedValue('starter')
    expect((await POST(request('pro_monthly', 'alipay'))).status).toBe(200)
    expect((await POST(request('starter_monthly', 'alipay'))).status).toBe(200)
  })

})

describe('POST /api/checkout for a member, Waffo and ended subscriptions', () => {
  beforeEach(resetMember)

  it('on Waffo too, and a pack is always allowed', async () => {
    mocks.channel.mockReturnValue('waffo')
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([{ ...liveRow('active'), provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: 'ORD_1', productId: 'max_monthly' }])
    expect((await POST(request('max_monthly'))).status).toBe(409)
    expect((await POST(request('pro_yearly'))).status).toBe(409)
    expect((await POST(request('pack_m'))).status).toBe(200)
    expect((await POST(request('max_yearly'))).status).toBe(200)
    expect(mocks.createWaffoCheckout).toHaveBeenCalledTimes(2)
  })

  it('an ended subscription does not block a new one', async () => {
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([liveRow('canceled'), liveRow('incomplete_expired')])
    expect((await POST(request('pro_yearly'))).status).toBe(200)
  })

  it('asks the buyer to review a Stripe discount quote after the channel switches to Waffo', async () => {
    mocks.channel.mockReturnValue('waffo')
    mocks.getSessionUser.mockResolvedValue(USER)
    const req = new NextRequest(`${ORIGIN}/api/checkout`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ product_id: 'pack_s', method: 'card', expected_code: 'OFFER20' }) })
    const response = await POST(req)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CODE_CHECKOUT_OFFER_CHANGED' })
    expect(mocks.createWaffoCheckout).not.toHaveBeenCalled()
  })

})

// 中国银行卡 (T64): zh pages on Stripe only.
describe('POST /api/checkout cn_card', () => {
  beforeEach(() => {
    mocks.createCheckout.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })
    mocks.createWaffoCheckout.mockReset().mockResolvedValue({ url: 'https://pay.waffo.test/c/1' })
    mocks.channel.mockReset().mockReturnValue('stripe')
    mocks.mirror.mockReset().mockResolvedValue([])
    mocks.tier.mockReset().mockResolvedValue(null)
    mocks.getSessionUser.mockReset().mockResolvedValue(USER)
  })

  it('takes cn_card with a zh locale on Stripe', async () => {
    expect((await POST(request('starter_monthly', 'cn_card', 'zh'))).status).toBe(200)
    expect(mocks.createCheckout).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ body: expect.objectContaining({ method: 'cn_card', locale: 'zh' }) }))
  })

  it.each([undefined, 'en'] as const)('answers 422 for cn_card with locale %s', async (locale) => {
    const response = await POST(request('pack_s', 'cn_card', locale))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' })
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('answers 422 for cn_card on Waffo, which never lists it', async () => {
    mocks.channel.mockReturnValue('waffo')
    expect((await POST(request('pack_s', 'cn_card', 'zh'))).status).toBe(422)
    expect(mocks.createWaffoCheckout).not.toHaveBeenCalled()
  })
})

it('refuses to open either channel when the database catalog differs from this build', async () => {
  const { configuredPricing } = await import('@/core/billing/checkout-price')
  const { site } = await import('@/site/site.config')
  const other = configuredPricing(site.billing) === 'v2' ? undefined : 'v2'
  for (const channel of ['stripe', 'waffo']) {
    resetMember()
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.channel.mockReturnValue(channel)
    mocks.pricing.mockResolvedValueOnce(other)
    expect((await POST(request())).status).toBe(409)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
    expect(mocks.createWaffoCheckout).not.toHaveBeenCalled()
  }
})
