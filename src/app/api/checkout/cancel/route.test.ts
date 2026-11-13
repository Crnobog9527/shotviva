import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

// Stripe's cancel_url when the session check cannot run (ARCHITECTURE §7「会话校验」): a
// discounted checkout waiting to be released gets a retryable 503, never a silent skip.
const mocks = vi.hoisted(() => ({ user: vi.fn(), release: vi.fn(), retrieve: vi.fn() }))
vi.mock('@/core/auth', async () => ({
  createAdminSupabase: () => ({}),
  getSessionUser: mocks.user,
  isAuthUnavailable: (await import('@/core/auth/session-errors')).isAuthUnavailable,
}))
vi.mock('@/core/analytics', () => ({ trackCheckoutCancel: vi.fn() }))
vi.mock('@/core/billing/stripe', async (original) => ({
  ...(await original<typeof import('@/core/billing/stripe')>()),
  stripeClient: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }),
  expireAndRelease: mocks.release,
}))

const { GET } = await import('./route')
const token = '0b5f7a52-6d39-4b55-9d0b-2b6f0f1e2c3a'
const visit = (withDiscount: boolean) =>
  GET(new NextRequest(`http://localhost:3000/api/checkout/cancel?c=${token}&l=en`, {
    headers: withDiscount ? { cookie: `sv_code_checkout=${token}:cs_test_abc` } : {},
  }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.retrieve.mockResolvedValue({ id: 'cs_test_abc' })
})

describe('checkout cancel while the session check is unavailable', () => {
  it('answers a retryable 503 when a discounted checkout is waiting to be released', async () => {
    mocks.user.mockRejectedValue(new AppError('AUTH_UNAVAILABLE', 'Session check unavailable (db)'))
    const response = await visit(true)
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('still sends a cancel without a discount back to pricing', async () => {
    mocks.user.mockRejectedValue(new AppError('AUTH_UNAVAILABLE', 'Session check unavailable (auth)'))
    expect((await visit(false)).status).toBe(303)
  })

  it('releases as before once the session is known', async () => {
    mocks.user.mockResolvedValue({ id: 'u1' })
    expect((await visit(true)).status).toBe(303)
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })
})
