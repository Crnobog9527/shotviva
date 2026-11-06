import { describe, expect, it } from 'vitest'

import { isEmailVerified, toSessionUser } from './session-user'

const base = { id: 'u1', email: 'a@b.co', email_confirmed_at: undefined, app_metadata: { provider: 'email' } }

describe('isEmailVerified', () => {
  it('is false for an email sign-up that never clicked the link', () => {
    expect(isEmailVerified(base)).toBe(false)
  })

  it('is true once confirmed', () => {
    expect(isEmailVerified({ ...base, email_confirmed_at: '2026-11-05T00:00:00Z' })).toBe(true)
  })

  it('trusts Google as the provider or one of the linked providers', () => {
    expect(isEmailVerified({ ...base, app_metadata: { provider: 'google' } })).toBe(true)
    expect(isEmailVerified({ ...base, app_metadata: { provider: 'email', providers: ['email', 'google'] } })).toBe(true)
  })
})

describe('toSessionUser', () => {
  it('only grants admin for an exact role match', () => {
    expect(toSessionUser(base, { role: 'admin' }).role).toBe('admin')
    expect(toSessionUser(base, { role: 'Admin' }).role).toBe('user')
    expect(toSessionUser(base, null).role).toBe('user')
  })

  it('marks a profile with banned_at as banned', () => {
    expect(toSessionUser(base, { role: 'user', banned_at: '2026-11-06T00:00:00Z' }).banned).toBe(true)
    expect(toSessionUser(base, { role: 'user', banned_at: null }).banned).toBe(false)
    expect(toSessionUser(base, null).banned).toBe(false)
  })
})
