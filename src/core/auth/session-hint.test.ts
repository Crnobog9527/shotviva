import { describe, expect, it } from 'vitest'

import { sessionCookieName } from './cookie-token'
import { hasSessionCookie } from './session-hint'

// The browser-side "probably signed in" (session-hint.ts): the cookie's presence only, under the
// name the server reads the session from.
describe('session hint', () => {
  const names = [sessionCookieName('https://abcdefghij.supabase.co'), sessionCookieName('http://127.0.0.1:54321')]

  it('finds a whole or a chunked session cookie among others', () => {
    for (const name of names) {
      expect(hasSessionCookie(`a=1; ${name}=base64-xyz; b=2`)).toBe(true)
      expect(hasSessionCookie(`${name}.0=base64-xy; ${name}.1=z`)).toBe(true)
      expect(hasSessionCookie(`a=1;${name}=x`)).toBe(true)
    }
  })

  it('is false without one and for look-alike names', () => {
    const [name] = names
    expect(hasSessionCookie('')).toBe(false)
    expect(hasSessionCookie('sv_first=1; sv_code_result=x')).toBe(false)
    expect(hasSessionCookie(`${name}-code-verifier=x`)).toBe(false)
    expect(hasSessionCookie(`x${name}=1`)).toBe(false)
    expect(hasSessionCookie(`note=${name}`)).toBe(false)
  })
})
