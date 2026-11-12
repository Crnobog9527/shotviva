import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Identity } from './identity'

// The proxy's one session check (ARCHITECTURE §7「会话校验」): what it forwards, and what it does
// when Auth or the database cannot answer. The check itself is identity.test.ts.
const mocks = vi.hoisted(() => ({ identity: { status: 'signed_out' } as Identity, verify: vi.fn() }))
vi.mock('./identity', async (original) => ({ ...(await original<typeof import('./identity')>()), verifyIdentity: mocks.verify }))
vi.mock('@supabase/ssr', async (original) => ({ ...(await original<typeof import('@supabase/ssr')>()), createServerClient: () => ({ auth: {} }) }))
vi.mock('../public-env', () => ({ publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' } }))

const { proxyGate } = await import('./proxy-gates')
const { IDENTITY_HEADER, openIdentity, sealIdentity } = await import('./forwarded-identity')

const secret = 'service-role-key'
const user = { id: 'u1', email: null, phone: null, role: 'user' as const, verified: true, banned: false, locale: null, onboarding: { wishlistSeen: false, wishlistHintSeen: false } }
let forwarded: string | null | undefined
const forward = (request: NextRequest) => {
  forwarded = request.headers.get(IDENTITY_HEADER)
  return NextResponse.next({ request })
}
// A session cookie as @supabase/ssr writes it; the proxy seals for the access token inside.
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ sub: 'u1', exp })).toString('base64url')}.s`
const TOKEN = jwt(Math.floor(Date.now() / 1000) + 3600)
const SESSION = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: TOKEN, refresh_token: 'r' })).toString('base64url')}`
function gate(path: string, headers: Record<string, string> = {}) {
  return proxyGate(new NextRequest(`http://localhost:3000${path}`, { headers }), { translatedPaths: ['/account'], forward, identitySecret: secret })
}

beforeEach(() => {
  forwarded = undefined
  mocks.verify.mockReset()
  mocks.verify.mockImplementation(async () => mocks.identity)
})

describe('proxyGate session check', () => {
  it('checks once and seals the answer for the page, bound to the session token', async () => {
    mocks.identity = { status: 'signed_in', user }
    const response = await gate('/account', { cookie: SESSION })
    expect(response.status).toBe(200)
    expect(mocks.verify).toHaveBeenCalledTimes(1)
    expect(openIdentity(forwarded ?? '', TOKEN, secret)).toEqual(user)
    expect(openIdentity(forwarded ?? '', jwt(1), secret)).toBeNull()
  })

  it("drops a client's own identity header on every path", async () => {
    const forged = sealIdentity({ ...user, role: 'admin' }, TOKEN, 'guessed-key')
    await gate('/pricing', { [IDENTITY_HEADER]: forged })
    expect(forwarded).toBeNull()
    mocks.identity = { status: 'signed_out' }
    const response = await gate('/account', { cookie: SESSION, [IDENTITY_HEADER]: forged })
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Faccount')
  })

  it('lets a signed-in page through without an identity when the check cannot run, so the page retries', async () => {
    for (const source of ['auth', 'db'] as const) {
      mocks.identity = { status: 'unavailable', source }
      const response = await gate('/account', { cookie: SESSION })
      expect(response.status, source).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      expect(forwarded).toBeNull()
    }
  })

  it('keeps /admin a 404 when the check cannot run', async () => {
    mocks.identity = { status: 'unavailable', source: 'db' }
    expect((await gate('/admin', { cookie: SESSION })).status).toBe(404)
  })

  it('still sends a real sign-out to the login page', async () => {
    mocks.identity = { status: 'signed_out' }
    expect((await gate('/account', { cookie: SESSION })).status).toBe(307)
  })
})
