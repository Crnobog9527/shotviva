import { webcrypto } from 'node:crypto'

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { cookieToken, sessionCookieName } from './cookie-token'
import { verifyCookieIdentity } from './identity'

// Pages, Server Actions and route handlers check the session without ever refreshing it
// (review of #542): a refresh there rotates the refresh token server-side while a Server
// Component cannot write the new cookies, which signs the user out after Auth's reuse window.
const env = { url: 'http://127.0.0.1:54321', anonKey: 'anon' }
const KID = 'test-kid'
let privateKey: CryptoKey
let jwk: JsonWebKey

beforeAll(async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  privateKey = pair.privateKey as CryptoKey
  jwk = { ...(await webcrypto.subtle.exportKey('jwk', pair.publicKey)), kid: KID, alg: 'ES256', use: 'sig' } as JsonWebKey
})

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
async function token(exp: number, sub = 'u1') {
  const head = `${b64({ alg: 'ES256', kid: KID, typ: 'JWT' })}.${b64({ sub, exp, session_id: 's1', role: 'authenticated' })}`
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(head))
  return `${head}.${Buffer.from(signature).toString('base64url')}`
}
const cookieFor = (accessToken: string) => [{ name: sessionCookieName(env.url), value: `base64-${b64({ access_token: accessToken, refresh_token: 'r1', expires_at: 0 })}` }]
const row = { id: 'u1', email: 'a@b.co', phone: null, email_confirmed_at: '2026-11-01T00:00:00Z', phone_confirmed_at: null, app_metadata: {}, user_metadata: {}, role: 'user', banned_at: null }

// Every request the check makes, answered like local Supabase would.
function stubFetch() {
  const calls: { url: string; auth: string | null }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
    if (url.includes('/.well-known/jwks.json')) return Response.json({ keys: [jwk] })
    if (url.includes('/rest/v1/rpc/session_identity')) return Response.json([row])
    return new Response('unexpected', { status: 500 })
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// getClaims() checks exp against the real clock, so the test uses it too.
const now = Date.now()
const sec = (ms: number) => Math.floor(ms / 1000)

describe('verifyCookieIdentity (never refreshes)', () => {
  it('verifies the cookie token locally and reads session_identity() with exactly that token', async () => {
    const calls = stubFetch()
    const access = await token(sec(now) + 3600)
    expect(await verifyCookieIdentity(cookieFor(access), env, now)).toMatchObject({ status: 'signed_in', user: { id: 'u1', verified: true } })
    expect(calls.filter((c) => c.url.includes('/auth/v1/token') || c.url.includes('/auth/v1/user'))).toEqual([])
    expect(calls.find((c) => c.url.includes('session_identity'))?.auth).toBe(`Bearer ${access}`)
  })

  it('does not refresh a token inside the SDK\'s refresh margin, where getSession() would', async () => {
    const calls = stubFetch()
    const access = await token(sec(now) + 60)
    expect(await verifyCookieIdentity(cookieFor(access), env, now)).toMatchObject({ status: 'signed_in' })
    expect(calls.some((c) => c.url.includes('/auth/v1/token'))).toBe(false)
  })

  it('reports a token the proxy could not refresh as unavailable, without calling anything', async () => {
    const calls = stubFetch()
    for (const exp of [sec(now) - 5, sec(now) + 5]) {
      expect(await verifyCookieIdentity(cookieFor(await token(exp)), env, now)).toEqual({ status: 'unavailable', source: 'auth' })
    }
    expect(calls).toEqual([])
  })

  it('signs out a missing or unreadable cookie, and a token that is not ours', async () => {
    const calls = stubFetch()
    expect(await verifyCookieIdentity([], env, now)).toEqual({ status: 'signed_out' })
    expect(await verifyCookieIdentity([{ name: sessionCookieName(env.url), value: 'base64-garbage' }], env, now)).toEqual({ status: 'signed_out' })
    const forged = (await token(sec(now) + 3600)).replace(/\.[^.]+$/, `.${Buffer.alloc(64).toString('base64url')}`)
    expect(await verifyCookieIdentity(cookieFor(forged), env, now)).toEqual({ status: 'signed_out' })
    expect(calls.some((c) => c.url.includes('session_identity'))).toBe(false)
  })
})

describe('cookieToken', () => {
  it('reads a chunked cookie as @supabase/ssr writes it', async () => {
    const access = await token(sec(now) + 3600)
    const [whole] = cookieFor(access)
    const value = whole?.value ?? ''
    const chunks = [
      { name: `${sessionCookieName(env.url)}.0`, value: value.slice(0, 40) },
      { name: `${sessionCookieName(env.url)}.1`, value: value.slice(40) },
    ]
    expect(await cookieToken(chunks, env.url)).toEqual({ token: access, expiresAt: (sec(now) + 3600) * 1000 })
  })
})
