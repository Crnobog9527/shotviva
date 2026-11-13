import { describe, expect, it } from 'vitest'

import { openIdentity, sealIdentity } from './forwarded-identity'
import type { SessionUser } from './session-user'

const user: SessionUser = { id: 'u1', email: null, phone: '8613800000000', role: 'admin', verified: true, banned: false, locale: 'zh', onboarding: { wishlistSeen: false, wishlistHintSeen: true } }
const secret = 'service-role-key'
const token = 'eyJ.access.token'
const now = 1_800_000_000_000

describe('forwarded identity', () => {
  it('hands the proxy\'s answer to the page for the same session', () => {
    expect(openIdentity(sealIdentity(user, token, secret, now), token, secret, now + 59_000)).toEqual(user)
  })

  it('refuses a header made with another key, for another session, or more than a minute ago', () => {
    const sealed = sealIdentity(user, token, secret, now)
    expect(openIdentity(sealed, token, 'another-key', now)).toBeNull()
    expect(openIdentity(sealed, 'eyJ.someone.else', secret, now)).toBeNull()
    expect(openIdentity(sealed, token, secret, now + 60_000)).toBeNull()
  })

  it('refuses a client\'s forgery: a promoted role, a copied MAC, or garbage', () => {
    const [body, mac] = sealIdentity(user, token, secret, now).split('.') as [string, string]
    const envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const promoted = Buffer.from(JSON.stringify({ ...envelope, user: { ...user, id: 'attacker' } })).toString('base64url')
    expect(openIdentity(`${promoted}.${mac}`, token, secret, now)).toBeNull()
    for (const value of ['', 'x', `${body}.`, `${body}.${mac}.x`, `${body}.${'A'.repeat(43)}`]) {
      expect(openIdentity(value, token, secret, now), value).toBeNull()
    }
  })
})
