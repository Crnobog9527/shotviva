import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), createCheckout: vi.fn(), createWaffoCheckout: vi.fn(), channel: vi.fn(), mirror: vi.fn() }))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('@/core/billing/subscription/read-summary', () => ({ readMirrorRows: mocks.mirror }))
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
  })

  it('creates a session for a normal account', async () => {
    mocks.getSessionUser.mockResolvedValue(USER)
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.createCheckout).toHaveBeenCalledOnce()
  })

  it.each(['stripe', 'waffo'])('answers 403 for a banned account on the %s channel', async (channel) => {
    mocks.channel.mockReturnValue(channel)
    mocks.getSessionUser.mockResolvedValue({ ...USER, banned: true })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
    expect(mocks.createWaffoCheckout).not.toHaveBeenCalled()
  })

  // One running subscription per account (ARCHITECTURE §6.2, found in Codex's #165 run).
  it.each([
    ['active', false],
    ['active', true],
    ['past_due', false],
  ])('answers 409 SUBSCRIPTION_EXISTS for a membership while a %s subscription runs (cancelling: %s)', async (status, cancelling) => {
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([liveRow(status, cancelling)])
    for (const [product, method] of [['pro_monthly', 'card'], ['starter_yearly', 'alipay']] as const) {
      const response = await POST(request(product, method))
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'SUBSCRIPTION_EXISTS' })
    }
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('on Waffo too, and a pack is always allowed', async () => {
    mocks.channel.mockReturnValue('waffo')
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([{ ...liveRow('active'), provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: 'ORD_1' }])
    expect((await POST(request('max_monthly'))).status).toBe(409)
    expect((await POST(request('pack_m'))).status).toBe(200)
    expect(mocks.createWaffoCheckout).toHaveBeenCalledOnce()
  })

  it('an ended subscription does not block a new one', async () => {
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([liveRow('canceled'), liveRow('incomplete_expired')])
    expect((await POST(request('pro_yearly'))).status).toBe(200)
  })

})

// 中国银行卡 (T64): zh pages on Stripe only.
describe('POST /api/checkout cn_card', () => {
  beforeEach(() => {
    mocks.createCheckout.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })
    mocks.createWaffoCheckout.mockReset().mockResolvedValue({ url: 'https://pay.waffo.test/c/1' })
    mocks.channel.mockReset().mockReturnValue('stripe')
    mocks.mirror.mockReset().mockResolvedValue([])
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
