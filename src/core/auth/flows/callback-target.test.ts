import { describe, expect, it } from 'vitest'

import { callbackTarget, linkError } from './callback-target'

describe('callbackTarget', () => {
  it('sends a verified sign-in to the sanitized next path', () => {
    expect(callbackTarget({ kind: 'signed_in', verified: true, userId: 'u', flow: 'email' }, '/account')).toBe('/account')
    expect(callbackTarget({ kind: 'signed_in', verified: true, userId: 'u', flow: 'oauth' }, '//evil')).toBe('/account')
  })

  it('keeps unverified users out of the app', () => {
    expect(callbackTarget({ kind: 'signed_in', verified: false, userId: 'u', flow: 'email' }, '/account')).toBe(
      '/login?error=unverified',
    )
  })

  it('routes recovery to the new-password page, or back to reset when the link failed', () => {
    expect(callbackTarget({ kind: 'signed_in', verified: true, userId: 'u', flow: 'recovery' }, null)).toBe('/reset/update')
    expect(callbackTarget({ kind: 'error', error: 'link_expired', flow: 'recovery' }, null)).toBe('/reset?error=link_expired')
  })

  it('shows a fixed login error code', () => {
    expect(callbackTarget({ kind: 'error', error: 'oauth_failed', flow: 'oauth' }, '/account')).toBe(
      '/login?error=oauth_failed&next=%2Faccount',
    )
    expect(callbackTarget({ kind: 'no_session', flow: 'email' }, null)).toBe('/login?next=%2Faccount')
  })
})

describe('linkError', () => {
  it('maps Supabase link errors without echoing the description', () => {
    expect(linkError(new URLSearchParams('error=access_denied&error_code=otp_expired'), 'email')).toBe('link_expired')
    expect(linkError(new URLSearchParams('error=access_denied'), 'oauth')).toBe('oauth_failed')
    expect(linkError(new URLSearchParams('error=server_error'), 'email')).toBe('callback_failed')
    expect(linkError(new URLSearchParams('code=abc'), 'email')).toBeNull()
  })
})
