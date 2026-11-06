import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), createCheckout: vi.fn(), createWaffoCheckout: vi.fn(), channel: vi.fn() }))

vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
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
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', emailVerified: true, banned: false }
const request = () =>
  new NextRequest(`${ORIGIN}/api/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ product_id: 'pack_s', method: 'card' }),
  })

// ARCHITECTURE §7 (T25): a banned account keeps signing in but cannot start a checkout.
describe('POST /api/checkout', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset()
    mocks.createCheckout.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' })
    mocks.createWaffoCheckout.mockReset().mockResolvedValue({ url: 'https://pay.waffo.test/c/1' })
    mocks.channel.mockReset().mockReturnValue('stripe')
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
})
