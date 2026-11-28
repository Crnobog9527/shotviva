import { describe, expect, it } from 'vitest'

import { sessionCookieName } from './cookie-token'
import { hasSessionCookie, sessionCookieNameOf } from './session-hint'

const URL_ = 'https://abcdefghij.supabase.co'

// The browser-side "probably signed in" (session-hint.ts): the cookie's presence only, under the
// same name the server reads.
describe('session hint', () => {
  it('uses the name the server reads the session from', () => {
    expect(sessionCookieNameOf(URL_)).toBe(sessionCookieName(URL_))
    expect(sessionCookieNameOf('http://127.0.0.1:54321')).toBe(sessionCookieName('http://127.0.0.1:54321'))
    expect(sessionCookieNameOf('')).toBe('')
  })

  it('finds a whole or a chunked session cookie among others', () => {
    const name = sessionCookieNameOf(URL_)
    expect(hasSessionCookie(`a=1; ${name}=base64-xyz; b=2`, name)).toBe(true)
    expect(hasSessionCookie(`${name}.0=base64-xy; ${name}.1=z`, name)).toBe(true)
  })

  it('is false without one, for another project, and for a look-alike name', () => {
    const name = sessionCookieNameOf(URL_)
    expect(hasSessionCookie('', name)).toBe(false)
    expect(hasSessionCookie('sv_first=1; sb-other-auth-token=x', name)).toBe(false)
    expect(hasSessionCookie(`${name}-code-verifier=x`, name)).toBe(false)
    expect(hasSessionCookie(`x${name}=1`, name)).toBe(false)
    expect(hasSessionCookie(`${name}=x`, '')).toBe(false)
  })
})
