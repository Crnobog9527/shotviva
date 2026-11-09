import { beforeEach, describe, expect, it, vi } from 'vitest'

import { benefits } from '../../../../tests/t94-config'

// Phone sign-in server steps (T63): consent and +86 first, our limits before Supabase, a
// Supabase refusal before the hook gives the request back, a verified code signs in as 'phone'.
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
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../../i18n/server', () => ({ currentLocale: async () => 'zh' }))
vi.mock('../supabase-server', () => ({ createServerSupabase: async () => ({ auth: { signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp } }) }))
vi.mock('../supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: mocks.rpc }) }))
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
  mocks.rpc.mockResolvedValue({ data: 'ok', error: null })
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null })
})

describe('sendPhoneCode', () => {
  it('records the request with the visitor IP, then asks Supabase for an SMS code in +86 form', async () => {
    expect(await sendPhoneCode(form(ok))).toEqual({ status: 'sent' })
    expect(mocks.rpc).toHaveBeenCalledWith('sms_request_send', { p_phone_key: expect.stringMatching(/^[0-9a-f]{64}$/), p_ip: '203.0.113.7' })
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      phone: '+8614000000001',
      options: expect.objectContaining({ channel: 'sms', shouldCreateUser: true, captchaToken: 'tok', data: expect.objectContaining({ locale: 'zh' }) }),
    })
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
    expect(mocks.onVerifiedSignIn).toHaveBeenCalledWith('u1', benefits, 'phone', 'zh')
  })

  it('says a wrong or expired code plainly and signs nobody in', async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: { code: 'otp_expired', status: 403 } })
    expect(await verifyPhoneCode(form({ phone: '+8614000000001', code: '000000' }), benefits)).toEqual({ status: 'error', code: 'AUTH_OTP_INVALID' })
    expect(await verifyPhoneCode(form({ phone: '+8614000000001', code: '12' }), benefits)).toEqual({ status: 'error', code: 'AUTH_OTP_INVALID' })
    expect(mocks.onVerifiedSignIn).not.toHaveBeenCalled()
  })
})
