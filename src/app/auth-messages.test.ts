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
const tr = (locale: 'en' | 'zh', messages: object) => createTranslator({ locale, messages, namespace: 'auth' }) as unknown as T
const t = { en: tr('en', en), zh: tr('zh', zh) }

const FIELD_ERRORS: FieldError[] = ['loginEmail', 'email', 'passwordMissing', 'passwordShort', 'passwordWeak', 'mismatch']

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

  it('offers no Apple sign-in and never says prompt', () => {
    for (const messages of [en.auth, zh.auth]) {
      const text = JSON.stringify(messages)
      expect(text).not.toMatch(/apple/i)
      expect(text).not.toMatch(/prompt/i)
    }
  })
})
