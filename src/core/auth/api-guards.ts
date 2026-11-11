import 'server-only'
import type { NextRequest } from 'next/server'

import { AppError } from '../errors'
import { requestOrigin } from '../request-origin'
import { getSessionUser } from './session'
import type { SessionUser } from './session-user'

// Session cookies are SameSite=Lax already; the Origin check also stops a same-site
// subdomain or a form on another origin from triggering a state-changing call. The expected
// origin is appOrigin (each preview its branch URL), or on a preview the request's own host
// when it is an allow-listed test-site alias (core/request-origin).
export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin')
  if (origin !== requestOrigin(request)) throw new AppError('FORBIDDEN', 'Bad origin')
}

// API counterpart of requireUser(): JSON errors instead of redirects. Unverified accounts
// are kept out exactly as the (app) pages keep them out.
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AppError('UNAUTHORIZED', 'Sign in first')
  if (!user.verified) throw new AppError('FORBIDDEN', 'Verify your email or phone first')
  return user
}

// Checkout counterpart of reserve_credits' USER_BANNED: a banned account cannot pay either
// (ARCHITECTURE §7). The flag rides on the session's profile read, so no extra round trip.
export async function requireApiBuyer(): Promise<SessionUser> {
  const user = await requireApiUser()
  if (user.banned) throw new AppError('FORBIDDEN', 'This account is suspended')
  return user
}

// API counterpart of requireAdmin(): a non-admin gets the same 404 the admin pages give, so the
// admin API does not reveal it exists (admin test runs, T85).
export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user || !user.verified || user.role !== 'admin' || user.banned) throw new AppError('NOT_FOUND', 'Not found')
  return user
}
