import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }))
const request = vi.hoisted(() => ({ host: 'localhost:3000', env: {} as Record<string, unknown>, ref: undefined as string | undefined }))

vi.mock('server-only', () => ({}))
vi.mock('../../i18n/server', () => ({
  currentLocale: async () => 'zh',
  localized: async (path: string) => `/zh${path === '/' ? '' : path}`,
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: request.host, 'x-forwarded-for': '203.0.113.7' }),
  cookies: async () => new Map(request.ref ? [['sv_ref', { value: request.ref }]] : []),
}))
vi.mock('../../env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../env')>()
  return { ...actual, serverEnv: () => ({ ...actual.serverEnv(), ...request.env }) }
})
vi.mock('../supabase-server', () => ({ createSessionSupabase: async () => ({ auth: mocks }) }))
// orgs lookups for the staff link (core/auth/staff-signup): an active org.
const orgChain = { select: () => orgChain, eq: () => orgChain, maybeSingle: async () => ({ data: { id: '11111111-2222-4333-8444-555555555555' }, error: null }) }
vi.mock('../supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc, from: () => orgChain }) }))

const { resendSignupEmail, signUpWithPassword, updatePassword } = await import('./sign-up')

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const redirectOf = (call: unknown[]) => new URL((call[0] as { options: { emailRedirectTo: string } }).options.emailRedirectTo)

beforeEach(() => {
  vi.clearAllMocks()
  request.host = 'localhost:3000'
  request.env = {}
  request.ref = undefined
  mocks.rpc.mockResolvedValue({ data: 'ok', error: null })
})

describe('signUpWithPassword', () => {
  it('registers the request with the visitor IP before Supabase, and stops at our IP limit (1350)', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null })
    await signUpWithPassword(form({ email: 'Mei@Example.com', password: 'hunter2x' }))
    const [fn, args] = mocks.rpc.mock.calls[0]!
    expect(fn).toBe('signup_request')
    expect(args).toEqual({ p_email_key: expect.stringMatching(/^[0-9a-f]{64}$/), p_ip: '203.0.113.7', p_ref_slug: null })
    mocks.rpc.mockResolvedValueOnce({ data: 'ip_hourly', error: null })
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))).toEqual({ status: 'error', code: 'AUTH_SIGNUP_LIMITED' })
    expect(mocks.signUp).toHaveBeenCalledTimes(1)
  })

  it('links back to the allow-listed test-site alias the form was sent from (preview only)', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null })
    request.host = 'shotviva-qa-user.vercel.app'
    request.env = { VERCEL_ENV: 'preview', PREVIEW_EXTRA_HOSTS: ['shotviva-qa-user.vercel.app'] }
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: '/zh/photos' }))
    expect(redirectOf(mocks.signUp.mock.calls[0]!).origin).toBe('https://shotviva-qa-user.vercel.app')
    request.env = { VERCEL_ENV: 'production', PREVIEW_EXTRA_HOSTS: ['shotviva-qa-user.vercel.app'] }
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: '/zh/photos' }))
    expect(redirectOf(mocks.signUp.mock.calls[1]!).origin).toBe('http://localhost:3000')
  })

  it('sends the verification link back to `next` and stores the page language', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null })
    const state = await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: '/zh/connect/graylum?state=s' }))
    expect(state).toEqual({ status: 'sent' })
    const call = mocks.signUp.mock.calls[0]!
    expect(call[0]).toMatchObject({ email: 'mei@example.com', options: { data: { locale: 'zh' } } })
    expect(redirectOf(call).pathname).toBe('/auth/confirm')
    expect(redirectOf(call).searchParams.get('next')).toBe('/zh/connect/graylum?state=s')
  })

  it.each([
    'https://evil.example/',
    '//evil.example/account',
    '/\\evil.example',
    'javascript:alert(1)',
    '/.//evil.example',
    'evil.example/account',
])('sends a hostile next (%s) to the account page of the form’s language', async (next) => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null })
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next }))
    const target = redirectOf(mocks.signUp.mock.calls[0]!)
    expect(target.origin).toBe('http://localhost:3000')
    expect(target.searchParams.get('next')).toBe('/zh/account')
  })

  it('answers a registered address exactly like a new one (no enumeration)', async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { identities: [] } }, error: null })
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))).toEqual({ status: 'sent' })
    mocks.signUp.mockResolvedValueOnce({ data: { user: null }, error: { code: 'user_already_exists', status: 422 } })
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))).toEqual({ status: 'sent' })
  })

  it('maps other failures', async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: null }, error: { code: 'weak_password' } })
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))).toEqual({ status: 'error', code: 'AUTH_WEAK_PASSWORD' })
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'short' }))).toEqual({ status: 'error', code: 'INVALID_INPUT' })
  })
})

describe('resendSignupEmail', () => {
  it('resends the sign-up link to the same `next`', async () => {
    mocks.resend.mockResolvedValue({ error: null })
    expect(await resendSignupEmail(form({ email: 'mei@example.com', next: '/', captchaToken: 'tok' }))).toEqual({ status: 'sent' })
    expect(mocks.resend.mock.calls[0]![0]).toMatchObject({ type: 'signup', email: 'mei@example.com', options: { captchaToken: 'tok' } })
    expect(redirectOf(mocks.resend.mock.calls[0]!).searchParams.get('next')).toBe('/')
  })

  it('shows captcha and rate limits only, so it never tells whether the address exists', async () => {
    mocks.resend.mockResolvedValueOnce({ error: { code: 'over_email_send_rate_limit', status: 429 } })
    expect(await resendSignupEmail(form({ email: 'mei@example.com' }))).toEqual({ status: 'error', code: 'AUTH_RATE_LIMITED' })
    mocks.resend.mockResolvedValueOnce({ error: { code: 'something_else', status: 400 } })
    expect(await resendSignupEmail(form({ email: 'mei@example.com' }))).toEqual({ status: 'sent' })
  })
})

describe('updatePassword', () => {
  it('needs the confirmation to match, on the server too', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mocks.updateUser.mockResolvedValue({ error: null })
    expect(await updatePassword(form({ password: 'hunter2x', confirm: 'hunter2y' }))).toEqual({ status: 'error', code: 'INVALID_INPUT' })
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(await updatePassword(form({ password: 'hunter2x', confirm: 'hunter2x' }))).toEqual({ status: 'sent' })
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'hunter2x' })
  })
})

describe('signUpWithPassword: staff link sign-up', () => {
  // Codex P1 (#841): a staff-link sign-up remembers its token for a confirmation resent from /login.
  it('stores the staff link token on the account; any other sign-up stores none', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null })
    const token = 'b'.repeat(32)
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: `/zh/join/org/${token}` }))
    expect(mocks.signUp.mock.calls[0]![0].options.data).toEqual({ locale: 'zh', staff_invite: token, staff_org: '11111111-2222-4333-8444-555555555555' })
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: '/zh/account' }))
    expect(mocks.signUp.mock.calls[1]![0].options.data).toEqual({ locale: 'zh' })
  })
})

// 2027: the sv_ref slug goes with the request so the database can apply the looser org-link limit
// (it decides whether the slug is one); a malformed cookie sends none.
describe('signUpWithPassword: per-IP limit and the partner link', () => {
  it('passes the cookie\'s slug to signup_request', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] } }, error: null })
    request.ref = 'anna.' + Math.floor(Date.now() / 1000)
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))
    request.ref = 'not a cookie'
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))
    const slugs = mocks.rpc.mock.calls.filter(([fn]) => fn === 'signup_request').map(([, args]) => (args as { p_ref_slug: unknown }).p_ref_slug)
    expect(slugs).toEqual(['anna', null])
  })
})

// 2021 (ARCHITECTURE §6.5): the partner link's cookie onto the new account, so verifying the
// email on another device still binds it.
describe('signUpWithPassword: partner referral', () => {
  const stores = () => mocks.rpc.mock.calls.filter(([fn]) => fn === 'affiliate_signup_ref_store')
  const ref = () => 'anna.' + Math.floor(Date.now() / 1000)

  it('stores this browser\'s sv_ref cookie against the account Supabase created', async () => {
    request.ref = ref()
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] } }, error: null })
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))).toEqual({ status: 'sent' })
    expect(stores()).toEqual([['affiliate_signup_ref_store', { p_user: 'u1', p_slug: 'anna' }]])
  })

  // Review on #961: an earlier form for the same address (anyone's) must not outlive this one.
  it('clears the stored partner without a cookie or for a staff link, and leaves it when the sign-up failed', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] } }, error: null })
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))
    request.ref = ref()
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: `/zh/join/org/${'b'.repeat(32)}` }))
    expect(stores()).toEqual(Array(2).fill(['affiliate_signup_ref_store', { p_user: 'u1', p_slug: null }]))
    mocks.signUp.mockResolvedValue({ data: { user: null }, error: { code: 'over_email_send_rate_limit', status: 429 } })
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))
    expect(stores()).toHaveLength(2)
  })

  it('a failed store still answers "sent"', async () => {
    request.ref = ref()
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] } }, error: null })
    mocks.rpc.mockResolvedValueOnce({ data: 'ok', error: null }).mockRejectedValueOnce(new Error('down'))
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))).toEqual({ status: 'sent' })
  })
})
