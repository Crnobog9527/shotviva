import { NextRequest } from 'next/server'
import { expect, it, vi } from 'vitest'

import { findRetry } from './pinned'

// A retried Waffo checkout whose session was never created still carries the org owner's
// 开票信息 (#844): the title is not in the saved params, so the retry reads it again.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), finish: vi.fn(), billing: vi.fn() }))
vi.mock('@/core/auth', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/core/billing/catalog-attempt', async (original) => ({
  ...(await original<typeof import('@/core/billing/catalog-attempt')>()),
  resumeAttempt: vi.fn(async () => ({ params: {}, session_id: null, session_url: null })),
  finishWaffo: mocks.finish,
}))
vi.mock('@/core/billing/waffo', () => ({ waffoClient: () => ({}), buyerBillingDetail: mocks.billing }))

const BILLING = { country: 'CN', isBusiness: true, businessName: 'Acme', taxId: '91310000MA1FL0000X' }

it('passes the owner\'s billing detail to finishWaffo on a retry', async () => {
  mocks.billing.mockResolvedValue(BILLING)
  mocks.finish.mockResolvedValue({ url: 'https://checkout.waffo.ai/s/cs_1' })
  const request = new NextRequest('https://pr.test/api/checkout', { method: 'POST', headers: { 'idempotency-key': 'd1141cd3-3024-43d0-ad54-2969fd05edce' } })
  await findRetry(request, 'buyer', { product_id: 'pack_s', pricing_version: 'v2', method: 'card', locale: 'en' }, 'waffo')
  expect(mocks.billing).toHaveBeenCalledWith(expect.anything(), 'buyer')
  expect(mocks.finish.mock.calls[0]![5]).toEqual(BILLING)
})
