import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), getUser: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('../../i18n/server', () => ({
  currentLocale: async () => 'zh',
  localized: async (path: string) => `/zh${path === '/' ? '' : path}`,
}))
vi.mock('../supabase-server', () => ({ createServerSupabase: async () => ({ auth: mocks }) }))

const { alreadyRegistered, resendSignupEmail, signUpWithPassword, updatePassword } = await import('./sign-up')

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const redirectOf = (call: unknown[]) => new URL((call[0] as { options: { emailRedirectTo: string } }).options.emailRedirectTo)

beforeEach(() => vi.clearAllMocks())

describe('alreadyRegistered', () => {
  it('reads both of Supabase’s answers for a registered address', () => {
    expect(alreadyRegistered({ data: { user: { identities: [] } }, error: null })).toBe(true)
    expect(alreadyRegistered({ data: { user: null }, error: { code: 'user_already_exists' } })).toBe(true)
    expect(alreadyRegistered({ data: { user: { identities: [{}] } }, error: null })).toBe(false)
    expect(alreadyRegistered({ data: { user: null }, error: { code: 'weak_password' } })).toBe(false)
  })
})

describe('signUpWithPassword', () => {
  it('sends the verification link back to `next` and stores the page language', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null })
    const state = await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: '/zh/connect/graylum?state=s' }))
    expect(state).toEqual({ status: 'sent' })
    const call = mocks.signUp.mock.calls[0]!
    expect(call[0]).toMatchObject({ email: 'mei@example.com', options: { data: { locale: 'zh' } } })
    expect(redirectOf(call).pathname).toBe('/auth/confirm')
    expect(redirectOf(call).searchParams.get('next')).toBe('/zh/connect/graylum?state=s')
  })

  it('falls back to the account page of the form’s language', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null })
    await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x', next: 'https://evil.example/' }))
    expect(redirectOf(mocks.signUp.mock.calls[0]!).searchParams.get('next')).toBe('/zh/account')
  })

  it('says the address is taken (?err=exists) and maps other failures', async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { identities: [] } }, error: null })
    expect(await signUpWithPassword(form({ email: 'mei@example.com', password: 'hunter2x' }))).toEqual({ status: 'exists' })
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
