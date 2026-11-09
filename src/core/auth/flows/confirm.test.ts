import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type SetAll = (cookies: { name: string; value: string; options: object }[]) => void

const mocks = vi.hoisted(() => ({
  isAffiliateEnabled: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  onVerifiedSignIn: vi.fn(),
  setAll: null as SetAll | null,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: SetAll } }) => {
    mocks.setAll = options.cookies.setAll
    return { auth: { verifyOtp: mocks.verifyOtp, getUser: mocks.getUser } }
  },
}))
vi.mock('../../affiliate/feature', () => ({ isAffiliateEnabled: mocks.isAffiliateEnabled }))
vi.mock('../first-sign-in', () => ({ onVerifiedSignIn: mocks.onVerifiedSignIn }))

const { handleAuthConfirm } = await import('./confirm')

const ORIGIN = 'http://localhost:3000'
const TOKEN = 'pkce_0123456789abcdef0123456789abcdef'
const VERIFIED = { id: 'u1', email_confirmed_at: '2026-11-05T00:00:00Z', app_metadata: { provider: 'email' } }

function confirm(query: string) {
  return handleAuthConfirm(new NextRequest(`${ORIGIN}/auth/confirm?${query}`), { freeCredits: 3 })
}

function target(response: Response) {
  const location = response.headers.get('location') ?? ''
  expect(location.startsWith(`${ORIGIN}/`)).toBe(true)
  return location.slice(ORIGIN.length)
}

// One token hash, one session: the first click verifies, any later click finds it used.
function singleUseToken() {
  let used = false
  mocks.verifyOtp.mockImplementation(async () => {
    if (used) return { data: {}, error: { code: 'otp_expired', status: 403 } }
    used = true
    mocks.setAll?.([{ name: 'sb-access-token', value: 'session', options: { path: '/' } }])
    mocks.getUser.mockResolvedValue({ data: { user: VERIFIED } })
    return { data: { user: VERIFIED }, error: null }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: null } })
  mocks.onVerifiedSignIn.mockResolvedValue(undefined)
  singleUseToken()
})

describe('GET /auth/confirm: signup links', () => {

  it('verifies a signup link, sets the session cookie and runs the first sign-in path', async () => {
    const response = await confirm(`next=%2Faccount&token_hash=${TOKEN}&type=signup`)
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'signup' })
    expect(response.status).toBe(307)
    expect(target(response)).toBe('/account')
    expect(response.headers.get('set-cookie')).toContain('sb-access-token=session')
    expect(mocks.onVerifiedSignIn).toHaveBeenCalledExactlyOnceWith('u1', 3, 'email', 'en')
  })

  it('lets an invited promoter choose a password when the program is open', async () => {
    mocks.isAffiliateEnabled.mockResolvedValueOnce(true)
    expect(target(await confirm(`next=%2Fpartners&token_hash=${TOKEN}&type=invite`))).toBe('/reset/update')
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'invite' })
  })

  it('keeps a safe next path and drops an off-site one', async () => {
    expect(target(await confirm(`next=%2Fgenerate%3Ftemplate%3Dx&token_hash=${TOKEN}&type=email`))).toBe(
      '/generate?template=x',
    )
    singleUseToken()
    expect(target(await confirm(`next=%2F%2Fevil.example&token_hash=${TOKEN}&type=signup`))).toBe('/account')
  })

  it('sends an expired or already-used link back to login without granting credits', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', status: 403 } })
    const response = await confirm(`next=%2Faccount&token_hash=${TOKEN}&type=signup`)
    expect(target(response)).toBe('/login?error=link_expired&next=%2Faccount')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mocks.onVerifiedSignIn).not.toHaveBeenCalled()
  })

  it('maps any other verification failure to a fixed error code', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'unexpected_failure', status: 500 } })
    expect(target(await confirm(`token_hash=${TOKEN}&type=signup`))).toBe('/login?error=callback_failed&next=%2Faccount')
  })

  it('rejects a malformed link without calling Supabase', async () => {
    for (const query of ['type=signup', `token_hash=${TOKEN}`, `token_hash=${TOKEN}&type=invite`, 'token_hash=a%20b&type=signup']) {
      expect(target(await confirm(query))).toBe('/login?error=callback_failed&next=%2Faccount')
    }
    expect(target(await confirm('type=recovery'))).toBe('/reset?error=link_expired')
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
  })

})

describe('GET /auth/confirm: recovery, replays and unverified sessions', () => {
  it('lands a recovery link on the update-password page, or back on reset when it failed', async () => {
    const response = await confirm(`next=%2Freset%2Fupdate&token_hash=${TOKEN}&type=recovery`)
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'recovery' })
    expect(target(response)).toBe('/reset/update')
    expect(response.headers.get('set-cookie')).toContain('sb-access-token=session')
    expect(target(await confirm(`next=%2Freset%2Fupdate&token_hash=${TOKEN}&type=recovery`))).toBe('/reset?error=link_expired')
  })

  it('runs the free-credit path once when the same link is opened twice', async () => {
    expect(target(await confirm(`next=%2Faccount&token_hash=${TOKEN}&type=signup`))).toBe('/account')
    expect(target(await confirm(`next=%2Faccount&token_hash=${TOKEN}&type=signup`))).toBe(
      '/login?error=link_expired&next=%2Faccount',
    )
    expect(mocks.onVerifiedSignIn).toHaveBeenCalledTimes(1)
  })

  it('keeps an unverified session out of the app', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { ...VERIFIED, email_confirmed_at: null } } })
    expect(target(await confirm(`token_hash=${TOKEN}&type=magiclink`))).toBe('/login?error=unverified')
    expect(mocks.onVerifiedSignIn).not.toHaveBeenCalled()
  })
})
