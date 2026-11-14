import { describe, expect, it } from 'vitest'

import { isVerified, toSessionUser } from './session-user'

const base = { id: 'u1', email: 'a@b.co', email_confirmed_at: undefined, app_metadata: { provider: 'email' } }

describe('isVerified', () => {
  it('is false for an email sign-up that never clicked the link', () => {
    expect(isVerified(base)).toBe(false)
  })

  it('is true once confirmed', () => {
    expect(isVerified({ ...base, email_confirmed_at: '2026-11-05T00:00:00Z' })).toBe(true)
  })

  it('trusts Google as the provider or one of the linked providers', () => {
    expect(isVerified({ ...base, app_metadata: { provider: 'google' } })).toBe(true)
    expect(isVerified({ ...base, app_metadata: { provider: 'email', providers: ['email', 'google'] } })).toBe(true)
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

describe('phone sign-ups (T63)', () => {
  const phoneUser = { id: 'u2', email: '', email_confirmed_at: undefined, phone: '8614000000001', app_metadata: { provider: 'phone' } }

  it('a confirmed phone counts as verified, exactly like a confirmed email', () => {
    expect(isVerified(phoneUser)).toBe(false)
    expect(isVerified({ ...phoneUser, phone_confirmed_at: '2026-11-07T00:00:00Z' })).toBe(true)
  })

  it('carries the phone and no email when Supabase has none', () => {
    const user = toSessionUser({ ...phoneUser, phone_confirmed_at: '2026-11-07T00:00:00Z' }, { role: 'user' })
    expect(user).toMatchObject({ email: null, phone: '8614000000001', verified: true })
    expect(toSessionUser(base, null).phone).toBeNull()
  })
})
