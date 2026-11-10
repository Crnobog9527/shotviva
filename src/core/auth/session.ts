import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'

import { localized } from '../i18n/server'
import { loginPath } from './redirect-target'
import { toSessionUser, type SessionUser } from './session-user'
import { createServerSupabase } from './supabase-server'

// One auth round trip per request, however many components ask.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase()
  // getUser() validates the token with Supabase Auth; the cookie alone is not trusted.
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const { data: profile } = await supabase.from('profiles').select('role, banned_at').eq('id', data.user.id).maybeSingle()
  return toSessionUser(data.user, profile)
})

// Unverified email accounts never get into the (app) group (T1 acceptance). `next` is the
// logical path; both it and the login page follow the current language.
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(await localized(loginPath(next ? await localized(next) : undefined)))
  if (!user.verified) redirect(await localized('/login?error=unverified'))
  return user
}

// Admin pages must not reveal they exist, so non-admins get a plain 404.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user || !user.verified || user.role !== 'admin' || user.banned) notFound()
  return user
}
