import { beforeEach, describe, expect, it, vi } from 'vitest'

import { benefits } from '../../../tests/t94-config'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  bind: vi.fn(),
  claim: vi.fn().mockResolvedValue(null),
  claimQuietly: vi.fn().mockResolvedValue(false),
  track: vi.fn(),
  recordSignupIp: vi.fn(),
  grantSignupCredits: vi.fn(),
  noteSignupGift: vi.fn(),
  gift: vi.fn(async (_admin: unknown, _user: string, _next: unknown, credits: number) => credits),
}))

vi.mock('../affiliate/referral', () => ({ bindReferral: mocks.bind }))
vi.mock('./signup-code', () => ({ consumeSignupCode: mocks.claim }))
vi.mock('./signup-gift-claim', () => ({ claimQuietly: mocks.claimQuietly }))
vi.mock('next/headers', () => ({ headers: mocks.headers, cookies: async () => new Map([['sv_ref', { value: 'partner' }]]) }))
vi.mock('../analytics', () => ({ track: mocks.track }))
vi.mock('../alerts', () => ({ noteSignupGift: mocks.noteSignupGift }))
vi.mock('./supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('./staff-signup', () => ({ signupGiftFor: mocks.gift }))
vi.mock('./free-credits', () => ({ billingGrant: () => vi.fn(), grantSignupCredits: mocks.grantSignupCredits }))
vi.mock('./signup-ip', async (original) => ({
  ...(await original<typeof import('./signup-ip')>()),
  recordSignupIp: mocks.recordSignupIp,
}))

const { onVerifiedSignIn, signupMarks } = await import('./first-sign-in')

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
    // 1350: a new account checks the day's gift count for the Owner alert.
    expect(mocks.noteSignupGift).toHaveBeenCalledOnce()
  })

  it('does not track a later sign-in, even when a failed gift is retried then', async () => {
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'google', 'en')
    expect(mocks.track).not.toHaveBeenCalled()
    expect(mocks.noteSignupGift).not.toHaveBeenCalled()
  })

  it('binds the independent affiliate referral alongside the invitation', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(true)
    mocks.claim.mockResolvedValueOnce('invite')
    await onVerifiedSignIn('u1', benefits, 'google', 'en')
    expect(mocks.bind).toHaveBeenCalledWith('u1', 'partner', 'signup')
    // The partner link binds first, so an org member's invite code cannot take the customer (§6.5).
    expect(mocks.bind.mock.invocationCallOrder[0]).toBeLessThan(mocks.claim.mock.invocationCallOrder[0])
    expect(mocks.track).toHaveBeenCalledWith('signup', { method: 'google', code_kind: 'invite' }, { distinctId: 'u1', locale: 'en' })
  })

  it('1480: a gift the grant left pending is claimed after the sign-in, and the Owner alert checks', async () => {
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(false)
    mocks.claimQuietly.mockResolvedValueOnce(true)
    await onVerifiedSignIn('u1', benefits, 'google', 'zh')
    expect(mocks.claimQuietly).toHaveBeenCalledExactlyOnceWith({}, 'u1')
    expect(mocks.noteSignupGift).toHaveBeenCalledOnce()
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('1480: no claim when the grant paid', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh')
    expect(mocks.claimQuietly).not.toHaveBeenCalled()
  })

  it('falls back to the grant when there is no client IP', async () => {
    mocks.headers.mockResolvedValue(new Headers())
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh')
    expect(mocks.track).toHaveBeenCalledOnce()
  })
})

// Share links opened before signing up ride on the signup event (§5.1f, §5.1g).
describe('signupMarks', () => {
  it('carries a template share and a template collection link, and drops malformed ones', () => {
    expect(signupMarks(new Map([['sv_share', { value: 'ramen.k3x9m2pa' }], ['sv_tshare', { value: 'a2p138a5lj0w' }]]), new Map())).toEqual({
      share_template_id: 'ramen', share_id: 'k3x9m2pa', share_collection_id: 'a2p138a5lj0w',
    })
    expect(signupMarks(new Map([['sv_tshare', { value: 'bad' }]]), new Map())).toEqual({})
  })
})

describe('onVerifiedSignIn: staff-link signups', () => {
  it('pays the gift the staff rule allows and asks for no pending gift when it is 0', async () => {
    mocks.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.7' }))
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(false)
    mocks.gift.mockResolvedValueOnce(0)
    const next = '/zh/join/org/' + 'a'.repeat(32)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh', next)
    expect(mocks.gift).toHaveBeenCalledWith({}, 'u1', next, benefits.freeCredits)
    expect(mocks.grantSignupCredits).toHaveBeenCalledWith(expect.anything(), 'u1', 0)
    expect(mocks.claimQuietly).not.toHaveBeenCalled()
  })
})
