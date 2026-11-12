import { randomUUID } from 'node:crypto'

import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { connectAdmin, localSupabase, retryAuth } from './helpers'
import { serviceSupabase } from './supabase-env'

// ARCHITECTURE §7「会话校验」, migration 1285: session_identity() answers what GoTrue's GET /user
// used to (deleted, Auth-banned, signed-out sessions get nothing) plus the profile, from one
// PostgREST call; and the proxy checks a signed-in page with no Auth round trip.

let db: Client
type Account = { id: string; email: string; password: string }

async function account(): Promise<Account> {
  const email = `t-session-${randomUUID()}@example.test`
  const password = `pw-${randomUUID()}`
  const user = await retryAuth(async () => {
    const { data, error } = await serviceSupabase().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { locale: 'zh' } })
    if (error || !data.user) throw error ?? new Error('createUser failed')
    return data.user
  })
  return { id: user.id, email, password }
}

async function signedIn(who: Account): Promise<{ client: SupabaseClient; token: string }> {
  const { apiUrl, anonKey } = localSupabase()
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false } })
  const token = await retryAuth(async () => {
    const { data, error } = await client.auth.signInWithPassword({ email: who.email, password: who.password })
    if (error || !data.session) throw error ?? new Error('no session')
    return data.session.access_token
  })
  return { client, token }
}

// A client that only carries the access token, as a stolen-but-valid JWT would.
function bearer(token: string): SupabaseClient {
  const { apiUrl, anonKey } = localSupabase()
  return createClient(apiUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
}

const identityOf = async (client: SupabaseClient) => {
  const { data, error, status } = await client.rpc('session_identity')
  return { rows: (data ?? []) as Record<string, unknown>[], error, status }
}

beforeAll(async () => {
  db = await connectAdmin()
}, 60_000)

afterAll(async () => {
  await db?.end()
})

describe('session_identity()', () => {
  it('returns the account, its fresh metadata and its profile for a live session', async () => {
    const who = await account()
    await db.query("update public.profiles set role = 'admin', banned_at = now() where id = $1", [who.id])
    const { client } = await signedIn(who)
    // Written after sign-in: the JWT still carries the old metadata, the function reads it fresh.
    await serviceSupabase().auth.admin.updateUserById(who.id, { user_metadata: { locale: 'zh', onboarding: { wishlistSeen: true } } })
    const { rows, status } = await identityOf(client)
    expect(status).toBe(200)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: who.id, email: who.email, role: 'admin', user_metadata: { onboarding: { wishlistSeen: true } } })
    expect(rows[0]?.banned_at).not.toBeNull()
    expect(rows[0]?.email_confirmed_at).not.toBeNull()
  })

  it('returns nothing once the session is signed out, though the JWT is still unexpired', async () => {
    const who = await account()
    const { client, token } = await signedIn(who)
    await client.auth.signOut({ scope: 'local' })
    expect((await identityOf(bearer(token))).rows).toEqual([])
  })

  it('returns nothing for an Auth-banned or deleted account', async () => {
    const banned = await account()
    const live = await signedIn(banned)
    await serviceSupabase().auth.admin.updateUserById(banned.id, { ban_duration: '24h' })
    expect((await identityOf(bearer(live.token))).rows).toEqual([])

    const deleted = await account()
    const gone = await signedIn(deleted)
    await serviceSupabase().auth.admin.deleteUser(deleted.id)
    expect((await identityOf(bearer(gone.token))).rows).toEqual([])
  })

  it('returns nothing for a session past its time box', async () => {
    const who = await account()
    const { token } = await signedIn(who)
    await db.query("update auth.sessions set not_after = now() - interval '1 second' where user_id = $1", [who.id])
    expect((await identityOf(bearer(token))).rows).toEqual([])
  })

  it('is not callable without a session', async () => {
    const { apiUrl, anonKey } = localSupabase()
    const { status } = await identityOf(createClient(apiUrl, anonKey, { auth: { persistSession: false } }))
    expect(status).toBe(401)
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(
      "select has_function_privilege('anon', 'public.session_identity()', 'execute') as anon, has_function_privilege('authenticated', 'public.session_identity()', 'execute') as authenticated",
    )
    expect(rows[0]).toEqual({ anon: false, authenticated: true })
  })
})

describe('proxy session check with a real session', () => {
  type Gate = typeof import('@/core/auth/proxy-gates').proxyGate
  let proxyGate: Gate
  let identityHeader: string
  let openIdentity: typeof import('@/core/auth/forwarded-identity').openIdentity

  beforeAll(async () => {
    const { apiUrl, anonKey } = localSupabase()
    process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
    ;({ proxyGate } = await import('@/core/auth/proxy-gates'))
    ;({ IDENTITY_HEADER: identityHeader, openIdentity } = await import('@/core/auth/forwarded-identity'))
  })

  async function cookieFor(who: Account): Promise<{ cookie: string; token: string; refresh: string }> {
    let jar: { name: string; value: string }[] = []
    const { apiUrl, anonKey } = localSupabase()
    const client = createServerClient(apiUrl, anonKey, {
      cookies: { getAll: () => jar, setAll: (set) => { jar = set.map(({ name, value }) => ({ name, value })) } },
    })
    const { data } = await retryAuth(async () => {
      const result = await client.auth.signInWithPassword({ email: who.email, password: who.password })
      if (result.error) throw result.error
      return result
    })
    return { cookie: jar.map(({ name, value }) => `${name}=${value}`).join('; '), token: data.session?.access_token ?? '', refresh: data.session?.refresh_token ?? '' }
  }

  it('lets a signed-in page through with one database call and no Auth round trip, and seals it for the page', async () => {
    const who = await account()
    const { cookie, token } = await cookieFor(who)
    const secret = 'local-service-key'
    let forwarded: string | null = null
    const forward = (request: NextRequest) => {
      forwarded = request.headers.get(identityHeader)
      return NextResponse.next({ request })
    }
    const visit = () => proxyGate(new NextRequest('http://localhost:3000/account', { headers: { cookie } }), { translatedPaths: [], forward, identitySecret: secret })
    await visit() // the first visit on an instance fetches the JWKS; it is cached for 10 minutes
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await visit()
    const urls = fetchSpy.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input))
    fetchSpy.mockRestore()
    expect(response.status).toBe(200)
    expect(urls.filter((url) => url.includes('/auth/v1/'))).toEqual([])
    expect(urls.filter((url) => url.includes('/rest/v1/'))).toEqual([expect.stringContaining('/rest/v1/rpc/session_identity')])
    expect(openIdentity(forwarded ?? '', token, secret)).toMatchObject({ id: who.id, verified: true, role: 'user', locale: 'zh' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Review of #542: Auth answers 429 when the proxy must refresh an expired token. The proxy lets
  // the page through without touching the cookies; the page checks without refreshing (a refresh
  // there would rotate the refresh token and lose the new one); the session is still alive after.
  it('survives a rate-limited refresh: no cookie change, no refresh in the page, session still usable', async () => {
    const who = await account()
    const { cookie, refresh } = await cookieFor(who)
    const { verifyCookieIdentity } = await import('@/core/auth/identity')
    const real = globalThis.fetch.bind(globalThis)
    const refreshes: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/auth/v1/token')) {
        refreshes.push(url)
        return Response.json({ code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, { status: 429 })
      }
      return real(input, init)
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 3600 * 1000) // the access token is now expired

    let forwardedCookies: { name: string; value: string }[] = []
    // A signed-in page (the gate) and a public one (refresh only, updateSession).
    for (const path of ['/pricing', '/account']) {
      const response = await proxyGate(new NextRequest(`http://localhost:3000${path}`, { headers: { cookie } }), {
        translatedPaths: [],
        forward: (request) => {
          forwardedCookies = request.cookies.getAll()
          return NextResponse.next({ request })
        },
        identitySecret: 'local-service-key',
      })
      expect(response.status, path).toBe(200)
      expect(response.headers.get('location'), path).toBeNull()
      expect(response.cookies.getAll(), path).toEqual([])
      expect(forwardedCookies.map(({ name, value }) => `${name}=${value}`).join('; '), path).toBe(cookie)
    }
    expect(refreshes.length).toBeGreaterThan(0)

    const before = refreshes.length
    const { apiUrl, anonKey } = localSupabase()
    expect(await verifyCookieIdentity(forwardedCookies, { url: apiUrl, anonKey })).toEqual({ status: 'unavailable', source: 'auth' })
    expect(refreshes.length).toBe(before)

    vi.useRealTimers()
    vi.restoreAllMocks()
    const { error } = await createClient(apiUrl, anonKey, { auth: { persistSession: false } }).auth.refreshSession({ refresh_token: refresh })
    expect(error).toBeNull()
  })

  it('sends a signed-out session to the login page', async () => {
    const who = await account()
    const { cookie } = await cookieFor(who)
    await db.query('delete from auth.sessions where user_id = $1', [who.id])
    const response = await proxyGate(new NextRequest('http://localhost:3000/account', { headers: { cookie } }), { translatedPaths: [], forward: (r) => NextResponse.next({ request: r }) })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login?next=%2Faccount')
  })
})
