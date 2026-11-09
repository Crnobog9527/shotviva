import { beforeEach, describe, expect, it, vi } from 'vitest'

import { benefits } from '../../../tests/t94-config'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  bind: vi.fn(),
  claim: vi.fn().mockResolvedValue(null),
  track: vi.fn(),
  recordSignupIp: vi.fn(),
  grantSignupCredits: vi.fn(),
}))

vi.mock('../affiliate/referral', () => ({ bindReferral: mocks.bind }))
vi.mock('./signup-code', () => ({ consumeSignupCode: mocks.claim }))
vi.mock('next/headers', () => ({ headers: mocks.headers, cookies: async () => new Map([['sv_ref', { value: 'partner' }]]) }))
vi.mock('../analytics', () => ({ track: mocks.track }))
vi.mock('./supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('./free-credits', () => ({ billingGrant: () => vi.fn(), grantSignupCredits: mocks.grantSignupCredits }))
vi.mock('./signup-ip', async (original) => ({
  ...(await original<typeof import('./signup-ip')>()),
  recordSignupIp: mocks.recordSignupIp,
}))

const { onVerifiedSignIn } = await import('./first-sign-in')

// `signup` fires once per account (ARCHITECTURE §16.2), also for an account the same-IP rule
// refused the gift (T25): with an IP the first sign-in is the one that stored it.
describe('onVerifiedSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.7' }))
  })

  it('tracks signup when the IP was stored now, even if the gift was refused', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(false)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh')
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('signup', { method: 'email', code_kind: null }, { distinctId: 'u1', locale: 'zh' })
  })

  it('does not track a later sign-in, even when a failed gift is retried then', async () => {
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'google', 'en')
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('binds the independent affiliate referral alongside the invitation', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(true)
    mocks.claim.mockResolvedValueOnce('invite')
    await onVerifiedSignIn('u1', benefits, 'google', 'en')
    expect(mocks.bind).toHaveBeenCalledWith('u1', 'partner', 'signup')
    expect(mocks.track).toHaveBeenCalledWith('signup', { method: 'google', code_kind: 'invite' }, { distinctId: 'u1', locale: 'en' })
  })

  it('falls back to the grant when there is no client IP', async () => {
    mocks.headers.mockResolvedValue(new Headers())
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh')
    expect(mocks.track).toHaveBeenCalledOnce()
  })
})
