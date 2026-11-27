import { beforeEach, describe, expect, it, vi } from 'vitest'

import { benefits } from '../../../tests/t94-config'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  bind: vi.fn(),
  // This browser's sv_ref cookie.
  cookie: 'partner' as string | undefined,
  claim: vi.fn().mockResolvedValue(null),
  claimQuietly: vi.fn().mockResolvedValue(false),
  track: vi.fn(),
  recordSignupIp: vi.fn(),
  grantSignupCredits: vi.fn(),
  noteSignupGift: vi.fn(),
  staff: vi.fn(async (): Promise<boolean | 'unchecked'> => false),
}))

vi.mock('../affiliate/referral', () => ({ bindSignupReferral: mocks.bind }))
vi.mock('./signup-code', () => ({ consumeSignupCode: mocks.claim }))
vi.mock('./signup-gift-claim', () => ({ claimQuietly: mocks.claimQuietly }))
vi.mock('next/headers', () => ({ headers: mocks.headers, cookies: async () => new Map(mocks.cookie ? [['sv_ref', { value: mocks.cookie }]] : []) }))
vi.mock('../analytics', () => ({ track: mocks.track }))
vi.mock('../alerts', () => ({ noteSignupGift: mocks.noteSignupGift }))
vi.mock('./supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('./staff-signup', () => ({ staffSignup: mocks.staff }))
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

  it('does not track a later sign-in, even when a failed or daily-cap gift is paid then', async () => {
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'google', 'en')
    expect(mocks.track).not.toHaveBeenCalled()
    expect(mocks.claimQuietly).not.toHaveBeenCalled()
    // 2026: the gift paid now still counts toward today's, so the Owner alert checks.
    expect(mocks.noteSignupGift).toHaveBeenCalledOnce()
  })

  it('no Owner alert check on a later sign-in that paid nothing', async () => {
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(false)
    await onVerifiedSignIn('u1', benefits, 'google', 'en')
    expect(mocks.noteSignupGift).not.toHaveBeenCalled()
  })

  it('binds the independent affiliate referral alongside the invitation', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(true)
    mocks.claim.mockResolvedValueOnce('invite')
    await onVerifiedSignIn('u1', benefits, 'google', 'en')
    expect(mocks.bind).toHaveBeenCalledWith('u1', true, 'partner', false)
    // Not the signup confirmation click: the code stored at sign-up is taken but not used (2030).
    expect(mocks.claim).toHaveBeenCalledWith({}, 'u1', { first: true, fresh: true, useStored: false }, benefits.invite, 'en')
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

// 2021 (ARCHITECTURE §6.5): the first sign-in hands the cookie to the partner binding, which also
// takes the referral stored at sign-up (core/affiliate/referral).
describe('onVerifiedSignIn: partner binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookie = 'partner'
    mocks.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.7' }))
  })

  it('runs on the first sign-in even without a cookie (the stored one may bind)', async () => {
    mocks.cookie = undefined
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh', null, true)
    expect(mocks.bind).toHaveBeenCalledExactlyOnceWith('u1', true, undefined, true)
  })

  it('2024: with an IP the link binds before the gift, so the grant sees an org partner\'s binding', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh', null, true)
    expect(mocks.bind).toHaveBeenCalledExactlyOnceWith('u1', true, 'partner', true)
    expect(mocks.bind.mock.invocationCallOrder[0]).toBeLessThan(mocks.grantSignupCredits.mock.invocationCallOrder[0]!)
  })

  it('2024: without an IP (local dev) the first sign-in is only known from the grant, so the link binds after it', async () => {
    mocks.headers.mockResolvedValue(new Headers())
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh')
    expect(mocks.bind).toHaveBeenCalledExactlyOnceWith('u1', true, 'partner', false)
    expect(mocks.grantSignupCredits.mock.invocationCallOrder[0]).toBeLessThan(mocks.bind.mock.invocationCallOrder[0]!)
  })

  it('a later sign-in does not run it', async () => {
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(false)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh')
    expect(mocks.bind).not.toHaveBeenCalled()
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
  const next = { token: 'a'.repeat(32), orgId: null }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.7' }))
  })

  it('a staff sign-up gets no gift, no pending claim, no signup code and no partner binding', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(false)
    mocks.staff.mockResolvedValueOnce(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh', next)
    expect(mocks.staff).toHaveBeenCalledWith({}, 'u1', next)
    expect(mocks.grantSignupCredits).toHaveBeenCalledWith(expect.anything(), 'u1', 0)
    expect(mocks.claimQuietly).not.toHaveBeenCalled()
    // Runs without binding: the referral stored at sign-up is still taken, so it never binds later.
    expect(mocks.bind).toHaveBeenCalledExactlyOnceWith('u1', false, 'partner', false)
    expect(mocks.claim).toHaveBeenCalledWith({}, 'u1', expect.objectContaining({ first: true, fresh: false }), benefits.invite, 'zh')
    // 1950 reads "no signup IP yet" as the first verified sign-in: the mark comes before the IP.
    expect(mocks.staff.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordSignupIp.mock.invocationCallOrder[0])
  })

  // Codex P1 (#841): an existing account the SQL declines to mark keeps its gift.
  it('pays the gift as before when the staff rule declines the account', async () => {
    mocks.recordSignupIp.mockResolvedValue(false)
    mocks.grantSignupCredits.mockResolvedValue(false)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh', next)
    expect(mocks.staff).toHaveBeenCalledWith({}, 'u1', next)
    expect(mocks.grantSignupCredits).toHaveBeenCalledWith(expect.anything(), 'u1', benefits.freeCredits)
  })

  it('an unchecked staff link pays nothing and leaves the signup IP for the next sign-in', async () => {
    mocks.staff.mockResolvedValueOnce('unchecked')
    mocks.grantSignupCredits.mockResolvedValue(false)
    await onVerifiedSignIn('u1', benefits, 'email', 'zh', next)
    expect(mocks.recordSignupIp).not.toHaveBeenCalled()
    expect(mocks.grantSignupCredits).toHaveBeenCalledWith(expect.anything(), 'u1', 0)
    // Not the first sign-in yet: the stored referral waits for the one that is.
    expect(mocks.bind).not.toHaveBeenCalled()
  })

  it('a customer sign-up (no staff link) is unchanged', async () => {
    mocks.recordSignupIp.mockResolvedValue(true)
    mocks.grantSignupCredits.mockResolvedValue(true)
    await onVerifiedSignIn('u1', benefits, 'email', 'en', null)
    expect(mocks.staff).toHaveBeenCalledWith({}, 'u1', null)
    expect(mocks.grantSignupCredits).toHaveBeenCalledWith(expect.anything(), 'u1', benefits.freeCredits)
    expect(mocks.bind).toHaveBeenCalledWith('u1', true, 'partner', false)
    expect(mocks.claim).toHaveBeenCalledWith({}, 'u1', expect.objectContaining({ first: true, fresh: true }), benefits.invite, 'en')
  })
})
