// 开票信息 (ARCHITECTURE §6.5): the route reads the org owner's billing detail for Waffo sessions
// only; a Stripe checkout never reads or sends it. Same mocks as route.test.ts.
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ notify: vi.fn(), getSessionUser: vi.fn(), createCheckout: vi.fn(), createWaffoCheckout: vi.fn(), channel: vi.fn(), mirror: vi.fn(), tier: vi.fn(), pricing: vi.fn(), catalog: vi.fn(), billing: vi.fn() }))

vi.mock('@/core/alerts', () => ({ notifyOwner: mocks.notify }))
vi.mock('@/core/auth/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.catalog }) }))

beforeEach(() => { mocks.notify.mockClear(); mocks.catalog.mockReset().mockImplementation(catalogRpc) })

async function catalogRpc(fn: string) {
  if (fn === 'resume_catalog_checkout') return { data: null, error: null }
  if (fn === 'read_catalog_member_rates') return { data: [], error: null }
  if (fn !== 'read_product_catalog') throw new Error('Unexpected checkout RPC ' + fn)
  const { site: current } = await import('@/site/site.config')
  const data = current.billing.products.map(p => ({
    product_id: p.id, credits: p.credits, usd_cents: Math.round(p.priceUsd * 100), listed: true,
    tier: p.tier, paid_days: p.paidDays, revision: current.billing.pricingVersion ? 2 : 1,
    kind: p.interval === 'month' ? 'monthly' : p.interval === 'year' ? 'yearly' : 'pack',
    name_en: p.id, name_zh: p.id,
  }))
  return { data, error: null }
}
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
  waffoWechatPayEnabled: () => false,
  createWaffoCheckout: mocks.createWaffoCheckout,
  buyerBillingDetail: mocks.billing,
}))

const { POST } = await import('./route')
const { site } = await import('@/site/site.config')

const ORIGIN = 'http://localhost:3000'
const USER = { id: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: null, role: 'user', verified: true, banned: false }
const request = (productId = 'pack_s', method = 'card', locale?: 'en' | 'zh') => {
  const product = site.billing.products.find(p => p.id === productId)!
  return new NextRequest(`${ORIGIN}/api/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ product_id: productId, method, locale, pricing_version: site.billing.pricingVersion ?? 'v1',
      expected_price_cents: Math.round(product.priceUsd * 100), expected_revision: site.billing.pricingVersion ? 2 : undefined }),
  })
}

describe('POST /api/checkout and the org billing detail', () => {
  const billing = { country: 'CN', isBusiness: true, businessName: 'Acme', taxId: '91310000MA1FL0000X' }
  beforeEach(() => {
    mocks.billing.mockReset().mockResolvedValue(billing)
    mocks.getSessionUser.mockResolvedValue(USER)
    mocks.mirror.mockResolvedValue([])
    mocks.createWaffoCheckout.mockReset().mockResolvedValue({ url: 'https://checkout.waffo.ai/x' })
    mocks.createCheckout.mockReset()
  })

  it('Waffo: the buyer\'s billing detail goes into the session', async () => {
    mocks.channel.mockReturnValue('waffo')
    expect((await POST(request('pack_m'))).status).toBe(200)
    expect(mocks.billing).toHaveBeenCalledWith(expect.anything(), USER.id)
    expect(mocks.createWaffoCheckout.mock.calls[0]![1]).toMatchObject({ billing })
  })

  it('Waffo, no profile (not an owner): billing is undefined', async () => {
    mocks.channel.mockReturnValue('waffo')
    mocks.billing.mockResolvedValue(undefined)
    expect((await POST(request('pack_m'))).status).toBe(200)
    expect(mocks.createWaffoCheckout.mock.calls[0]![1].billing).toBeUndefined()
  })

  it('Stripe: never read, never sent', async () => {
    mocks.channel.mockReturnValue('stripe')
    await POST(request('pack_m'))
    expect(mocks.billing).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.createCheckout.mock.calls)).not.toMatch(/Acme|billingDetail/)
  })
})
