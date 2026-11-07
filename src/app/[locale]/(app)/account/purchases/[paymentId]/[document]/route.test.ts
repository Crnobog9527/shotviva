import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), resolvePaymentDocument: vi.fn(), localized: vi.fn() }))

vi.mock('@/core/auth', () => ({ requireApiUser: mocks.requireApiUser, createAdminSupabase: () => ({}) }))
vi.mock('@/core/billing/stripe', () => ({ stripeClient: () => ({}) }))
vi.mock('@/core/billing/documents', () => ({ resolvePaymentDocument: mocks.resolvePaymentDocument }))
vi.mock('@/core/i18n/server', () => ({ localized: mocks.localized }))

const { GET } = await import('./route')

const call = (paymentId = '42', document = 'receipt') =>
  GET(new Request(`https://shotviva.test/zh/account/purchases/${paymentId}/${document}`), {
    params: Promise.resolve({ locale: 'zh', paymentId, document }),
  })

describe('GET /account/purchases/[paymentId]/[document] (T80)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireApiUser.mockResolvedValue({ id: 'u1' })
    mocks.localized.mockImplementation(async (path: string) => `/zh${path}`)
  })

  it('redirects to the link Stripe gave on this click, uncached', async () => {
    mocks.resolvePaymentDocument.mockResolvedValue('https://pay.stripe.com/receipts/payment/abc')
    const response = await call()
    expect(mocks.resolvePaymentDocument).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', paymentId: '42', document: 'receipt' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://pay.stripe.com/receipts/payment/abc')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('back to Purchases with a note when there is nothing to open', async () => {
    mocks.resolvePaymentDocument.mockResolvedValue(null)
    const response = await call('42', 'invoice')
    expect(response.headers.get('location')).toBe('https://shotviva.test/zh/account?purchases=unavailable')
  })

  it('needs a session', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError('UNAUTHORIZED', 'Sign in first'))
    expect((await call()).status).toBe(401)
    expect(mocks.resolvePaymentDocument).not.toHaveBeenCalled()
  })

  it("someone else's payment id is 404", async () => {
    mocks.resolvePaymentDocument.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    expect((await call('999')).status).toBe(404)
  })
})
