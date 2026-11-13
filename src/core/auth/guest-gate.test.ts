import { describe, expect, it } from 'vitest'

import { GUEST_PAGE, guestRedirect, loginNotice } from './guest-gate'
import { SIGNED_OUT, type Identity } from './identity'
import type { SessionUser } from './session-user'

const user = (verified = true): SessionUser => ({ id: 'u', email: null, phone: null, role: 'user', verified, banned: false, locale: null, onboarding: { wishlistSeen: false, wishlistHintSeen: false } })
const signedIn = (verified = true): Identity => ({ status: 'signed_in', user: user(verified) })
const q = (search: string) => new URLSearchParams(search)

describe('guest pages', () => {
  it('are /login and /signup only', () => {
    for (const path of ['/login', '/signup', '/login/']) expect(GUEST_PAGE.test(path)).toBe(true)
    for (const path of ['/login/x', '/reset', '/account', '/']) expect(GUEST_PAGE.test(path)).toBe(false)
  })
})

describe('guestRedirect (signed-in visitors of /login and /signup)', () => {
  it('sends a verified visitor on to a safe next, else to the app in the page language', () => {
    expect(guestRedirect(signedIn(), '/login', q('next=%2Fphotos'), 'en')).toBe('/photos')
    expect(guestRedirect(signedIn(), '/signup', q(''), 'zh')).toBe('/zh/generate')
    expect(guestRedirect(signedIn(), '/login', q('next=https%3A%2F%2Fevil.example'), 'en')).toBe('/generate')
  })

  it('shows the form to signed-out, unverified, unknown, and login notices', () => {
    expect(guestRedirect(SIGNED_OUT, '/login', q(''), 'en')).toBeNull()
    expect(guestRedirect({ status: 'unavailable', source: 'auth' }, '/login', q(''), 'en')).toBeNull()
    expect(guestRedirect(signedIn(false), '/signup', q(''), 'en')).toBeNull()
    expect(guestRedirect(signedIn(), '/login', q('error=unverified'), 'en')).toBeNull()
    expect(guestRedirect(signedIn(), '/login', q('error=bogus'), 'en')).toBe('/generate')
  })

  it('knows the login notices', () => {
    expect(loginNotice('link_expired')).toBe('link_expired')
    expect(loginNotice('<script>')).toBeNull()
    expect(loginNotice(null)).toBeNull()
  })
})
