import { describe, expect, it } from 'vitest'

import { classifyAuthError } from './classify-auth-error'

describe('classifyAuthError', () => {
  it.each([
    ['invalid_credentials', 'AUTH_INVALID_CREDENTIALS'],
    ['email_not_confirmed', 'AUTH_EMAIL_NOT_CONFIRMED'],
    ['captcha_failed', 'AUTH_CAPTCHA_FAILED'],
    ['over_email_send_rate_limit', 'AUTH_RATE_LIMITED'],
    ['weak_password', 'AUTH_WEAK_PASSWORD'],
  ])('maps %s', (code, expected) => {
    expect(classifyAuthError({ code })).toBe(expected)
  })

  it('treats bare 429s as rate limits and anything unknown as INTERNAL', () => {
    expect(classifyAuthError({ status: 429 })).toBe('AUTH_RATE_LIMITED')
    expect(classifyAuthError({ code: 'something_new' })).toBe('INTERNAL')
    expect(classifyAuthError(null)).toBe('INTERNAL')
  })
})
