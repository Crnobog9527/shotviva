import { beforeEach, describe, expect, it, vi } from 'vitest'

import { benefits } from '../../../../tests/t94-config'

// Phone sign-in server steps (T63): consent and +86 first, our limits before Supabase, a
// Supabase refusal before the hook gives the request back, a verified code signs in as 'phone'.
const cookie = vi.hoisted(() => ({ ref: undefined as string | undefined }))
const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
  onVerifiedSignIn: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
  cookies: async () => new Map(cookie.ref ? [['sv_ref', { value: cookie.ref }]] : []),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../../i18n/server', () => ({ currentLocale: async () => 'zh' }))
vi.mock('../supabase-server', () => ({ createSessionSupabase: async () => ({ auth: { signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp } }) }))
// orgs lookups for the staff link (core/auth/staff-signup): an active org.
const orgChain = { select: () => orgChain, eq: () => orgChain, maybeSingle: async () => ({ data: { id: '11111111-2222-4333-8444-555555555555' }, error: null }) }
vi.mock('../supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc, from: () => orgChain }) }))
vi.mock('../first-sign-in', () => ({ onVerifiedSignIn: mocks.onVerifiedSignIn }))

const { sendPhoneCode, verifyPhoneCode } = await import('./phone')

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const ok = { phone: '140 0000 0001', consent: 'on', captchaToken: 'tok' }

beforeEach(() => {
  vi.clearAllMocks()
  cookie.ref = undefined
  mocks.rpc.mockResolvedValue({ data: 'ok', error: null })
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null })
})

describe('sendPhoneCode', () => {
  it('records the request with the visitor IP, then asks Supabase for an SMS code in +86 form', async () => {
    expect(await sendPhoneCode(form(ok))).toEqual({ status: 'sent' })
    expect(mocks.rpc).toHaveBeenCalledWith('sms_request_send', { p_phone_key: expect.stringMatching(/^[0-9a-f]{64}$/), p_ip: '203.0.113.7', p_ref_slug: null, p_code: null })
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      phone: '+8614000000001',
      options: expect.objectContaining({ channel: 'sms', shouldCreateUser: true, captchaToken: 'tok', data: expect.objectContaining({ locale: 'zh' }) }),
    })
  })

  // Codex P1 follow-up (#841): a phone sign-up from a staff link remembers the token, so a code
  // requested again from /login later is still a staff sign-up.
  it('stores the staff link token on a new account only when the code is asked from a staff link', async () => {
    const token = 'd'.repeat(32)
    await sendPhoneCode(form({ ...ok, next: `/zh/join/org/${token}` }))
    expect(mocks.signInWithOtp.mock.calls[0]![0].options.data).toMatchObject({ locale: 'zh', staff_invite: token, staff_org: '11111111-2222-4333-8444-555555555555' })
    await sendPhoneCode(form({ ...ok, next: '/zh/account' }))
    expect(mocks.signInWithOtp.mock.calls[1]![0].options.data).not.toHaveProperty('staff_invite')
  })

  // 2027: the database decides whether the slug is a valid org partner link (looser IP limit).
  it('passes this browser\'s sv_ref slug with the request', async () => {
    cookie.ref = 'anna.' + Math.floor(Date.now() / 1000)
    await sendPhoneCode(form(ok))
    expect(mocks.rpc).toHaveBeenCalledWith('sms_request_send', expect.objectContaining({ p_ref_slug: 'anna' }))
  })

  it('sends nothing without the consent box, or for a number outside mainland China', async () => {
    expect(await sendPhoneCode(form({ ...ok, consent: '' }))).toEqual({ status: 'error', code: 'AUTH_CONSENT_REQUIRED' })
    expect(await sendPhoneCode(form({ ...ok, phone: '+14155550123' }))).toEqual({ status: 'error', code: 'AUTH_PHONE_INVALID' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })

  it.each([
    ['phone_cooldown', 'AUTH_SMS_COOLDOWN'],
    ['phone_daily', 'AUTH_SMS_DAILY_LIMIT'],
    ['ip_daily', 'AUTH_SMS_DAILY_LIMIT'],
  ])('stops at our %s limit before Supabase', async (status, code) => {
    mocks.rpc.mockResolvedValueOnce({ data: status, error: null })
    expect(await sendPhoneCode(form(ok))).toEqual({ status: 'error', code })
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })

  it('gives the request back when Supabase refused before the hook (failed hCaptcha)', async () => {
    mocks.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { code: 'captcha_failed', status: 400 } })
    expect(await sendPhoneCode(form(ok))).toEqual({ status: 'error', code: 'AUTH_CAPTCHA_FAILED' })
    expect(mocks.rpc).toHaveBeenLastCalledWith('sms_release_send', { p_phone_key: expect.any(String) })
  })

  it('keeps the request counted when the SMS itself failed', async () => {
    mocks.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { code: 'sms_send_failed', status: 500 } })
    expect(await sendPhoneCode(form(ok))).toEqual({ status: 'error', code: 'AUTH_SMS_FAILED' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})

describe('verifyPhoneCode', () => {
  it('signs in with the code, runs the first-sign-in grant as phone, and lands on next', async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ data: { user: { id: 'u1', user_metadata: { locale: 'zh' } } }, error: null })
    await expect(verifyPhoneCode(form({ phone: '+8614000000001', code: '402913', next: '/zh/generate' }), benefits)).rejects.toThrow('redirect:/zh/generate')
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ phone: '+8614000000001', token: '402913', type: 'sms' })
    expect(mocks.onVerifiedSignIn).toHaveBeenCalledWith('u1', benefits, 'phone', 'zh', null)
  })

  it('says a wrong or expired code plainly and signs nobody in', async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: { code: 'otp_expired', status: 403 } })
    expect(await verifyPhoneCode(form({ phone: '+8614000000001', code: '000000' }), benefits)).toEqual({ status: 'error', code: 'AUTH_OTP_INVALID' })
    expect(await verifyPhoneCode(form({ phone: '+8614000000001', code: '12' }), benefits)).toEqual({ status: 'error', code: 'AUTH_OTP_INVALID' })
    expect(mocks.onVerifiedSignIn).not.toHaveBeenCalled()
  })
})
