import { describe, expect, it } from 'vitest'

import { validateCode, validateEmail, validateLogin, validateNewPassword, validatePhoneSend, validateSignup } from './validate'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

describe('auth field checks (design/comps-v3-b/auth.html)', () => {
  it('login asks for the sign-up email and a password', () => {
    expect(validateLogin(form({ email: 'mei@example.com', password: 'x' }))).toBeNull()
    expect(validateLogin(form({ email: 'mei', password: '' }))).toEqual({ email: 'loginEmail', password: 'passwordMissing' })
  })

  it('sign-up checks the address and the 8-character minimum (?err=weak)', () => {
    expect(validateSignup(form({ email: ' mei@example.com ', password: '12345678' }))).toBeNull()
    expect(validateSignup(form({ email: 'mei@example', password: 'abc12' }))).toEqual({ email: 'email', password: 'passwordShort' })
  })

  it('reset needs an address only', () => {
    expect(validateEmail(form({ email: 'mei@example.com' }))).toBeNull()
    expect(validateEmail(form({}))).toEqual({ email: 'email' })
  })

  it('a new password needs the minimum, then a matching confirmation (?err=mismatch)', () => {
    expect(validateNewPassword(form({ password: 'hunter2', confirm: 'hunter2' }))).toEqual({ password: 'passwordShort' })
    expect(validateNewPassword(form({ password: 'hunter2x', confirm: 'hunter2y' }))).toEqual({ confirm: 'mismatch' })
    expect(validateNewPassword(form({ password: 'hunter2x', confirm: 'hunter2x' }))).toBeNull()
  })

  it('phone sign-in wants a mainland number and the consent box before a code (T63)', () => {
    expect(validatePhoneSend(form({ phone: '140 0000 0001', consent: 'on' }))).toBeNull()
    expect(validatePhoneSend(form({ phone: '+14155550123' }))).toEqual({ phone: 'phone', consent: 'consent' })
    expect(validateCode(form({ code: '402913' }))).toBeNull()
    expect(validateCode(form({ code: '4029' }))).toEqual({ code: 'code' })
  })
})
