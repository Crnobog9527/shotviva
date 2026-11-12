import { isAuthRetryableFetchError, isAuthSessionMissingError, type AuthError, type SupabaseClient, type User } from '@supabase/supabase-js'
import { z } from 'zod'

import { logger } from '../logger'
import { bearerClient } from './bearer-client'
import { cookieToken, usable } from './cookie-token'
import { toSessionUser, type SessionUser } from './session-user'

// Who sent this request, checked once (ARCHITECTURE §7「会话校验」). Used by the proxy and, when
// the proxy did not forward an answer, by the page or route itself. No Auth round trip for a
// live token:
//   1. getClaims() checks the access token's signature against the project's JWKS (asymmetric
//      ES256 key, fetched once per instance and cached 10 minutes). In the proxy it refreshes an
//      expired session first, the one time it talks to Auth; anywhere else nothing refreshes
//      (verifyCookieIdentity);
//   2. session_identity() (migration 1285) reads the account, its profile and the session row in
//      one PostgREST call. No row: the account was deleted or Auth-banned, or the session was
//      signed out, revoked or timed out. That is what getUser() used to tell us, plus the profile.
// "Signed out" and "could not tell" are kept apart: an Auth or database outage must never send a
// signed-in visitor to the login page (load test 2026-11-12: 11–20% bounced at 300 users).
export type Identity =
  | { status: 'signed_in'; user: SessionUser }
  | { status: 'signed_out' }
  | { status: 'unavailable'; source: 'auth' | 'db' }

export const SIGNED_OUT: Identity = { status: 'signed_out' }

// Network failures, gateway errors (502–504 come back as AuthRetryableFetchError), 5xx and rate
// limits say nothing about the session. A missing session, a bad or expired JWT, or a refresh
// token Auth rejected (4xx) is a real sign-out.
export function authUnavailable(error: AuthError): boolean {
  if (isAuthSessionMissingError(error)) return false
  if (isAuthRetryableFetchError(error)) return true
  const status = error.status ?? 0
  return status === 429 || status >= 500 || (status === 0 && error.name === 'AuthUnknownError')
}

// PostgREST answers 401 for a JWT it rejects (expired, bad signature) and 403 for a role that may
// not call the function; anything else (status 0 for a failed fetch, 5xx, timeouts) is an outage.
export function dbUnavailable(status: number): boolean {
  return status !== 401 && status !== 403
}

const Row = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  email_confirmed_at: z.string().nullable(),
  phone_confirmed_at: z.string().nullable(),
  app_metadata: z.record(z.string(), z.unknown()),
  user_metadata: z.record(z.string(), z.unknown()),
  role: z.string().nullable(),
  banned_at: z.string().nullable(),
})
type Row = z.infer<typeof Row>

// The row in the shape getUser() returned, so SessionUser is built exactly as before.
export function rowToSessionUser(row: Row): SessionUser {
  const user = {
    id: row.id,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    email_confirmed_at: row.email_confirmed_at ?? undefined,
    phone_confirmed_at: row.phone_confirmed_at ?? undefined,
    app_metadata: row.app_metadata as User['app_metadata'],
    user_metadata: row.user_metadata,
  }
  // A missing profile row (role null) is the least privileged role, as before.
  return toSessionUser(user, row.role === null ? null : { role: row.role, banned_at: row.banned_at })
}

// `token`: check this access token rather than the client's session (which getClaims() would
// refresh when it is near expiry).
async function claimsOf(supabase: SupabaseClient, token?: string): Promise<{ sub: string } | Identity> {
  const { data, error } = await supabase.auth.getClaims(token)
  if (error) {
    if (!authUnavailable(error)) return SIGNED_OUT
    logger.warn('auth.identity_unavailable', { source: 'auth', status: error.status, name: error.name })
    return { status: 'unavailable', source: 'auth' }
  }
  const sub = data?.claims.sub
  return typeof sub === 'string' && sub ? { sub } : SIGNED_OUT
}

async function profileOf(supabase: SupabaseClient, sub: string): Promise<Identity> {
  const { data, error, status } = await supabase.rpc('session_identity')
  if (error) {
    if (!dbUnavailable(status)) return SIGNED_OUT
    logger.warn('auth.identity_unavailable', { source: 'db', status, code: error.code })
    return { status: 'unavailable', source: 'db' }
  }
  const rows = z.array(Row).safeParse(data)
  if (!rows.success) {
    logger.error('auth.identity_bad_row', { issues: rows.error.issues.length })
    return { status: 'unavailable', source: 'db' }
  }
  const row = rows.data[0]
  return row && row.id === sub ? { status: 'signed_in', user: rowToSessionUser(row) } : SIGNED_OUT
}

// The proxy's check. `supabase` is bound to the request's cookies and may refresh the session:
// the proxy writes the rotated cookies onto both the forwarded request and the response.
export async function verifyIdentity(supabase: SupabaseClient, token?: string): Promise<Identity> {
  try {
    const claims = await claimsOf(supabase, token)
    if ('status' in claims) return claims
    return await profileOf(supabase, claims.sub)
  } catch (error) {
    // Next's own control flow (prerender bail-outs carry a digest) must pass through.
    if (typeof error === 'object' && error !== null && typeof (error as { digest?: unknown }).digest === 'string') throw error
    // WebCrypto or the client itself threw: we cannot tell, so we do not sign anyone out.
    logger.error('auth.identity_failed', { error })
    return { status: 'unavailable', source: 'auth' }
  }
}

// The same check for pages, Server Actions and route handlers, which must never refresh: the
// access token comes straight from the cookie and the session read carries exactly that token.
// A token already expired here is one the proxy could not refresh just now (Auth busy or down),
// so it is "unavailable", not a sign-out; a refresh token Auth rejected never gets this far,
// since the proxy clears those cookies on the request it forwards.
export async function verifyCookieIdentity(
  cookies: readonly { name: string; value: string }[],
  env: { url: string; anonKey: string },
  now = Date.now(),
): Promise<Identity> {
  const found = await cookieToken(cookies, env.url)
  if (!found) return SIGNED_OUT
  if (!usable(found, now)) {
    logger.warn('auth.identity_unavailable', { source: 'auth', reason: 'expired_unrefreshed' })
    return { status: 'unavailable', source: 'auth' }
  }
  return verifyIdentity(bearerClient(env, found.token), found.token)
}
