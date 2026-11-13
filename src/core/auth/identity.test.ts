import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { authUnavailable, dbUnavailable, verifyIdentity } from './identity'

const row = {
  id: 'u1',
  email: 'a@b.co',
  phone: null,
  email_confirmed_at: '2026-11-01T00:00:00Z',
  phone_confirmed_at: null,
  app_metadata: { provider: 'email' },
  user_metadata: { locale: 'zh', onboarding: { wishlistSeen: true } },
  role: 'admin',
  banned_at: null,
}

type Claims = { data: { claims: { sub: string } } | null; error: unknown }
type Rpc = { data: unknown; error: unknown; status: number }
function client(claims: Claims | (() => never), rpc: Rpc = { data: [row], error: null, status: 200 }) {
  const getClaims = vi.fn(async () => (typeof claims === 'function' ? claims() : claims))
  const call = vi.fn(async () => rpc)
  return { supabase: { auth: { getClaims }, rpc: call } as unknown as SupabaseClient, getClaims, rpc: call }
}
const verified: Claims = { data: { claims: { sub: 'u1' } }, error: null }

describe('verifyIdentity', () => {
  it('builds the session user from the one session_identity() row', async () => {
    const { supabase, rpc } = client(verified)
    expect(await verifyIdentity(supabase)).toEqual({
      status: 'signed_in',
      user: { id: 'u1', email: 'a@b.co', phone: null, role: 'admin', verified: true, banned: false, locale: 'zh', onboarding: { wishlistSeen: true, wishlistHintSeen: false } },
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('session_identity')
  })

  it('treats a missing profile as the least privileged role and keeps the ban flag', async () => {
    const noProfile = client(verified, { data: [{ ...row, role: null, banned_at: null }], error: null, status: 200 })
    expect(await verifyIdentity(noProfile.supabase)).toMatchObject({ status: 'signed_in', user: { role: 'user', banned: false } })
    const banned = client(verified, { data: [{ ...row, banned_at: '2026-11-11T00:00:00Z' }], error: null, status: 200 })
    expect(await verifyIdentity(banned.supabase)).toMatchObject({ status: 'signed_in', user: { role: 'admin', banned: true } })
  })

  it('signs out a missing session, a bad JWT and a refresh token Auth rejected, without touching the database', async () => {
    for (const error of [new AuthSessionMissingError(), new AuthInvalidJwtError('Invalid JWT signature'), new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found')]) {
      const { supabase, rpc } = client({ data: null, error })
      expect(await verifyIdentity(supabase)).toEqual({ status: 'signed_out' })
      expect(rpc).not.toHaveBeenCalled()
    }
  })

  it('never signs anyone out for an Auth outage', async () => {
    for (const error of [new AuthRetryableFetchError('fetch failed', 0), new AuthRetryableFetchError('Bad Gateway', 502), new AuthApiError('busy', 500, 'unexpected_failure'), new AuthApiError('slow down', 429, 'over_request_rate_limit'), new AuthUnknownError('not json', null)]) {
      const { supabase, rpc } = client({ data: null, error })
      expect(await verifyIdentity(supabase), error.message).toEqual({ status: 'unavailable', source: 'auth' })
      expect(rpc).not.toHaveBeenCalled()
    }
  })

  it('signs out when session_identity() has no row (deleted, Auth-banned, signed out or revoked) or another user', async () => {
    expect(await verifyIdentity(client(verified, { data: [], error: null, status: 200 }).supabase)).toEqual({ status: 'signed_out' })
    expect(await verifyIdentity(client({ data: { claims: { sub: 'u2' } }, error: null }).supabase)).toEqual({ status: 'signed_out' })
  })

  it('signs out a JWT PostgREST rejects, but not a database outage', async () => {
    const rejected = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } }
    expect(await verifyIdentity(client(verified, { ...rejected, status: 401 }).supabase)).toEqual({ status: 'signed_out' })
    for (const status of [0, 500, 503, 504]) {
      const outage = client(verified, { data: null, error: { code: '', message: 'TypeError: fetch failed' }, status })
      expect(await verifyIdentity(outage.supabase), String(status)).toEqual({ status: 'unavailable', source: 'db' })
    }
  })

  it('reports an unexpected row shape or a thrown client as unavailable, not signed out', async () => {
    expect(await verifyIdentity(client(verified, { data: [{ id: 'u1' }], error: null, status: 200 }).supabase)).toEqual({ status: 'unavailable', source: 'db' })
    const thrown = client(() => {
      throw new TypeError('crypto.subtle is not available')
    })
    expect(await verifyIdentity(thrown.supabase)).toEqual({ status: 'unavailable', source: 'auth' })
  })

  it("lets Next's own control flow through", async () => {
    const bailout = Object.assign(new Error('Dynamic server usage'), { digest: 'DYNAMIC_SERVER_USAGE' })
    const { supabase } = client(() => {
      throw bailout
    })
    await expect(verifyIdentity(supabase)).rejects.toBe(bailout)
  })
})

describe('outage classification', () => {
  it('splits Auth errors into sign-outs and outages', () => {
    expect(authUnavailable(new AuthSessionMissingError())).toBe(false)
    expect(authUnavailable(new AuthApiError('User not found', 403, 'user_not_found'))).toBe(false)
    expect(authUnavailable(new AuthRetryableFetchError('Service Unavailable', 503))).toBe(true)
  })

  it('splits PostgREST statuses into sign-outs and outages', () => {
    expect(dbUnavailable(401)).toBe(false)
    expect(dbUnavailable(403)).toBe(false)
    expect(dbUnavailable(0)).toBe(true)
    expect(dbUnavailable(503)).toBe(true)
  })
})
