import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { EMAIL_LINK_HOURS } from '@/core/auth/link-expiry'
import type { FieldError } from '@/core/auth/ui/validate'
import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'
import { freeStandardImages } from '@/site/content'

// The sign-in pages' copy (design/comps-v3-b/auth.html), checked in both languages
// (ARCHITECTURE §17: the four pages ship in English and Chinese together).
type T = (key: string, values?: Record<string, unknown>) => string
const t = {
  en: createTranslator({ locale: 'en', messages: en, namespace: 'auth' }) as unknown as T,
  zh: createTranslator({ locale: 'zh', messages: zh, namespace: 'auth' }) as unknown as T,
}

const FIELD_ERRORS: FieldError[] = ['loginEmail', 'email', 'passwordMissing', 'passwordShort', 'passwordWeak', 'mismatch', 'phone', 'code', 'consent']

describe('auth messages', () => {
  it('says what the signed-off comp says (en)', () => {
    expect(t.en('login.title')).toBe('Log in')
    expect(t.en('google')).toBe('Continue with Google')
    expect(t.en('signup.gift', { count: freeStandardImages })).toBe('3 free Standard images')
    expect(t.en('fieldErrors.passwordShort', { min: 8 })).toBe('Too short. Use 8 characters or more.')
    expect(t.en('expired.text', { hours: EMAIL_LINK_HOURS })).toBe(
      'Reset links work for one hour and only once. Ask for a new one and use it straight away.',
    )
    expect(t.en('resend.wait', { seconds: 52 })).toBe('Sent again · wait 52s')
  })

  it('has every field error and the Chinese free-image line', () => {
    for (const key of FIELD_ERRORS) {
      expect(t.en(`fieldErrors.${key}`, { min: 8 })).not.toMatch(/auth\./)
      expect(t.zh(`fieldErrors.${key}`, { min: 8 })).toMatch(/[一-鿿]/)
    }
    expect(t.zh('signup.gift', { count: freeStandardImages })).toBe('3 张标准清晰度免费图')
    expect(t.zh('reset.sent', { email: 'mei@example.com', hours: EMAIL_LINK_HOURS, addr: (c: string) => c })).toContain('1 小时内有效')
  })

  it('has one line for a verification that did not complete, and no checkbox wording', () => {
    expect(t.en('captcha.failed')).toBe("Verification didn't complete. Please try again.")
    expect(t.zh('captcha.failed')).toBe('验证没有完成，请再试一次。')
    // The phone consent box (T63) is a real checkbox; nothing else may talk about ticking one.
    const withoutConsent = (messages: typeof en.auth) => {
      const copy = structuredClone(messages) as Partial<typeof en.auth>
      delete copy.phone
      delete (copy.fieldErrors as Partial<typeof en.auth.fieldErrors>).consent
      delete (copy.errors as Partial<typeof en.auth.errors>).AUTH_CONSENT_REQUIRED
      return copy
    }
    for (const messages of [en.auth, zh.auth]) expect(JSON.stringify(withoutConsent(messages))).not.toMatch(/check below|tick|勾选|下方的验证/i)
  })

  it('discloses hCaptcha inside the consent sentence, or in one short line (Owner 2026-11-07)', () => {
    const plain = (chunks: string) => chunks
    const tags = { terms: plain, privacy: plain, hcaptcha: plain }
    expect(t.en('signup.fineCaptcha', tags)).toBe('By continuing you agree to the Terms and Privacy Policy. This page is protected by hCaptcha.')
    expect(t.zh('signup.fineCaptcha', tags)).toBe('继续即表示你同意服务条款和隐私政策，本页由 hCaptcha 提供人机验证。')
    expect(t.en('captcha.line', tags)).toBe('Protected by hCaptcha.')
    expect(t.zh('captcha.line', tags)).toBe('本页由 hCaptcha 提供人机验证。')
  })

  it('offers no Apple sign-in and never says prompt', () => {
    for (const messages of [en.auth, zh.auth]) {
      const text = JSON.stringify(messages)
      expect(text).not.toMatch(/apple/i)
      expect(text).not.toMatch(/prompt/i)
    }
  })

  it('has the phone sign-in copy in both languages (T63)', () => {
    const addr = (chunks: string) => chunks
    expect(t.zh('tabs.phone')).toBe('手机号')
    expect(t.zh('phone.send')).toBe('获取验证码')
    expect(t.zh('code.sent', { phone: '140****5678', minutes: 5, addr })).toBe('验证码已发送至 140****5678，5 分钟内有效。')
    expect(t.zh('code.wait', { seconds: 42 })).toBe('42 秒后可重新获取')
    const legal = { terms: addr, privacy: addr, aup: addr }
    expect(t.zh('phone.consent', legal)).toBe(
      '我已阅读并同意《服务条款》《隐私政策》《使用规范》，并同意将我的手机号等个人信息传输到中国大陆以外处理（数据存放在美国，短信由短信服务商发送）。',
    )
    expect(t.en('phone.consent', legal)).toMatch(
      /Terms of Service.*Privacy Policy.*Acceptable Use Policy.*outside mainland China.*United States.*SMS provider/,
    )
    // Owner 2026-11-08: the three documents are each a link of their own.
    const tagged = (tag: string) => (chunks: string) => `[${tag}:${chunks}]`
    const links = { terms: tagged('terms'), privacy: tagged('privacy'), aup: tagged('aup') }
    expect(t.zh('phone.consent', links)).toContain('[terms:《服务条款》][privacy:《隐私政策》][aup:《使用规范》]')
    expect(t.zh('errors.AUTH_CONSENT_REQUIRED')).toBe('请先勾选同意服务条款、隐私政策、使用规范和个人信息出境。')
    expect(t.en('errors.AUTH_CONSENT_REQUIRED')).toMatch(/Terms of Service.*Privacy Policy.*Acceptable Use Policy.*cross-border/)
    for (const code of ['AUTH_PHONE_INVALID', 'AUTH_CONSENT_REQUIRED', 'AUTH_SMS_COOLDOWN', 'AUTH_SMS_DAILY_LIMIT', 'AUTH_SMS_FAILED', 'AUTH_OTP_INVALID']) {
      expect(t.en(`errors.${code}`)).not.toMatch(/auth\./)
      expect(t.zh(`errors.${code}`)).toMatch(/[一-鿿]/)
    }
  })
})
