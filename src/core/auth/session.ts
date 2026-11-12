import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'

import { serverEnv } from '../env'
import { AppError } from '../errors'
import { localized } from '../i18n/server'
import { IDENTITY_HEADER, openIdentity } from './forwarded-identity'
import { verifyIdentity, type Identity } from './identity'
import { loginPath } from './redirect-target'
import type { SessionUser } from './session-user'
import { createServerSupabase } from './supabase-server'

// The proxy's answer, when it checked this request and sealed it for us (forwarded-identity.ts).
async function forwardedUser(supabase: Awaited<ReturnType<typeof createServerSupabase>>): Promise<SessionUser | null> {
  const value = (await headers()).get(IDENTITY_HEADER)
  const secret = serverEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!value || !secret) return null
  // Read from the cookie only: the proxy refreshed it, so nothing goes over the network here.
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? openIdentity(value, token, secret) : null
}

// One session check per request, however many components ask, and none at all when the proxy
// already made it: no Auth round trip and at most one database read (ARCHITECTURE §7「会话校验」).
export const sessionIdentity = cache(async (): Promise<Identity> => {
  const supabase = await createServerSupabase()
  const forwarded = await forwardedUser(supabase)
  return forwarded ? { status: 'signed_in', user: forwarded } : verifyIdentity(supabase)
})

// null when signed out. When Auth or the database could not answer it throws AUTH_UNAVAILABLE
// (503): pages show their retry state (error.tsx), routes answer 503, and nobody is sent to the
// login page for an outage. Callers that only decorate a page catch it and show the signed-out look.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const identity = await sessionIdentity()
  if (identity.status === 'unavailable') throw new AppError('AUTH_UNAVAILABLE', `Session check unavailable (${identity.source})`)
  return identity.status === 'signed_in' ? identity.user : null
})

export function isAuthUnavailable(error: unknown): boolean {
  return error instanceof AppError && error.code === 'AUTH_UNAVAILABLE'
}

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
