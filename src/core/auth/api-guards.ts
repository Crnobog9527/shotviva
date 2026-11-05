import 'server-only'
import type { NextRequest } from 'next/server'

import { AppError } from '../errors'
import { appOrigin } from '../site-url'
import { getSessionUser } from './session'
import type { SessionUser } from './session-user'

// Session cookies are SameSite=Lax already; the Origin check also stops a same-site
// subdomain or a form on another origin from triggering a state-changing call. appOrigin
// follows the Vercel environment, so each preview deployment accepts its own origin.
export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin')
  if (origin !== appOrigin) throw new AppError('FORBIDDEN', 'Bad origin')
}

// API counterpart of requireUser(): JSON errors instead of redirects. Unverified accounts
// are kept out exactly as the (app) pages keep them out.
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AppError('UNAUTHORIZED', 'Sign in first')
  if (!user.emailVerified) throw new AppError('FORBIDDEN', 'Verify your email first')
  return user
}
