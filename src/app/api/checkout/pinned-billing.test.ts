import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

import { findRetry } from './pinned'

// A retried Waffo checkout whose session was never created still carries the org owner's
// 开票信息 (#844): the title is not in the saved params, so the retry reads it again.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), finish: vi.fn(), billing: vi.fn(), resume: vi.fn(), stripe: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/core/billing/catalog-attempt', async (original) => ({
  ...(await original<typeof import('@/core/billing/catalog-attempt')>()),
  resumeAttempt: mocks.resume,
  finishWaffo: mocks.finish,
  finishStripe: mocks.stripe,
}))
vi.mock('@/core/billing/stripe', async (original) => ({ ...(await original<typeof import('@/core/billing/stripe')>()), stripeClient: () => ({}) }))
vi.mock('@/core/billing/waffo', () => ({ waffoClient: () => ({}), buyerBillingDetail: mocks.billing }))

const BILLING = { country: 'CN', isBusiness: true, businessName: 'Acme', taxId: '91310000MA1FL0000X' }

const retry = (channel: 'waffo' | 'stripe') => findRetry(
  new NextRequest('https://pr.test/api/checkout', { method: 'POST', headers: { 'idempotency-key': 'd1141cd3-3024-43d0-ad54-2969fd05edce' } }),
  'buyer', { product_id: 'pack_s', pricing_version: 'v2', method: 'card', locale: 'en' }, channel)

beforeEach(() => {
  mocks.billing.mockReset().mockResolvedValue(BILLING)
  mocks.finish.mockReset().mockResolvedValue({ url: 'https://checkout.waffo.ai/s/cs_1' })
  mocks.stripe.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_1' })
  mocks.resume.mockReset().mockResolvedValue({ params: {}, session_id: null, session_url: null })
})

it('passes the owner\'s billing detail to finishWaffo on a retry', async () => {
  await retry('waffo')
  expect(mocks.billing).toHaveBeenCalledWith(expect.anything(), 'buyer')
  expect(mocks.finish.mock.calls[0]![5]).toEqual(BILLING)
})

it('no profile: the retry goes on without it', async () => {
  mocks.billing.mockResolvedValue(undefined)
  await retry('waffo')
  expect(mocks.finish.mock.calls[0]![5]).toBeUndefined()
})

it('a session that already exists, or Stripe: no billing read', async () => {
  mocks.resume.mockResolvedValue({ params: {}, session_id: 'cs_1', session_url: 'https://checkout.waffo.ai/s/cs_1' })
  await retry('waffo')
  mocks.resume.mockResolvedValue({ params: {}, session_id: null, session_url: null })
  await retry('stripe')
  expect(mocks.billing).not.toHaveBeenCalled()
})
