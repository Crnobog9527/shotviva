import 'server-only'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { cache } from 'react'

import { serverEnv } from '../env'
import { AppError } from '../errors'
import { localized } from '../i18n/server'
import { publicEnv } from '../public-env'
import { cookieToken, usable } from './cookie-token'
import { IDENTITY_HEADER, openIdentity } from './forwarded-identity'
import { verifyCookieIdentity, type Identity } from './identity'
import { loginPath } from './redirect-target'
import { isAuthUnavailable } from './session-errors'
import type { SessionUser } from './session-user'

type Cookies = { name: string; value: string }[]

// The proxy's answer, when it checked this request and sealed it for us (forwarded-identity.ts).
// A token about to lapse is not taken from the header either: the cookie check then reports it as
// unavailable, the same as a token the proxy could not refresh.
async function forwardedUser(jar: Cookies, now: number): Promise<SessionUser | null> {
  const value = (await headers()).get(IDENTITY_HEADER)
  const secret = serverEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!value || !secret) return null
  const found = await cookieToken(jar, publicEnv.NEXT_PUBLIC_SUPABASE_URL)
  return found && usable(found, now) ? openIdentity(value, found.token, secret, now) : null
}

// One session check per request, however many components ask, and none at all when the proxy
// already made it: no Auth round trip and at most one database read (ARCHITECTURE §7「会话校验」).
// Never refreshes the session: only the proxy can hand rotated cookies to the browser.
export const sessionIdentity = cache(async (): Promise<Identity> => {
  // The check reads the clock; Cache Components requires the render to be request-time first.
  await connection()
  const jar = (await cookies()).getAll()
  const now = Date.now()
  const forwarded = await forwardedUser(jar, now)
  if (forwarded) return { status: 'signed_in', user: forwarded }
  return verifyCookieIdentity(jar, { url: publicEnv.NEXT_PUBLIC_SUPABASE_URL, anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY }, now)
})

// null when signed out. When Auth or the database could not answer it throws AUTH_UNAVAILABLE
// (503): pages show their retry state (error.tsx), routes answer 503, and nobody is sent to the
// login page for an outage. Callers that only decorate a page catch it and show the signed-out look.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const identity = await sessionIdentity()
  if (identity.status === 'unavailable') throw new AppError('AUTH_UNAVAILABLE', `Session check unavailable (${identity.source})`)
  return identity.status === 'signed_in' ? identity.user : null
})

export { isAuthUnavailable }

// Unverified email accounts never get into the (app) group (T1 acceptance). `next` is the
// logical path; both it and the login page follow the current language.
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(await localized(loginPath(next ? await localized(next) : undefined)))
  if (!user.verified) redirect(await localized('/login?error=unverified'))
  return user
}

// Admin pages must not reveal they exist, so non-admins get a plain 404; so does everyone while
// the session cannot be checked.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser().catch((error: unknown) => {
    if (isAuthUnavailable(error)) notFound()
    throw error
  })
  if (!user || !user.verified || user.role !== 'admin' || user.banned) notFound()
  return user
}
