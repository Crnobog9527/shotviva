import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '../public-env'
import { loginPath } from './redirect-target'
import { toSessionUser, type SessionUser } from './session-user'
import { hasSessionCookie, proxySupabase, updateSession } from './update-session'

// With cacheComponents, notFound()/redirect() inside a page stream as a 200 after the
// static shell has gone out. These gates answer with a real status before rendering;
// requireUser()/requireAdmin() in pages and actions stay as the authoritative check.
const ADMIN = /^\/admin(\/|$)/
// /connect/graylum is gated as a page only: its form POST (…/authorize) handles a lost
// session itself, since a 307 here would replay the POST against the login page.
const SIGNED_IN = /^\/(account|reset\/update)(\/|$)|^\/connect\/graylum\/?$/

export type Gate = 'admin' | 'signed_in' | null

export function gateFor(pathname: string): Gate {
  if (ADMIN.test(pathname)) return 'admin'
  if (SIGNED_IN.test(pathname)) return 'signed_in'
  return null
}

export function notFoundResponse(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}

async function currentUser(request: NextRequest) {
  const { supabase, response } = proxySupabase(request)
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { user: null, response }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  return { user: toSessionUser(data.user, profile), response }
}

// Pure decision so every branch is unit-tested without a network.
export function decide(gate: Exclude<Gate, null>, user: SessionUser | null, pathname: string, search: string) {
  if (gate === 'admin') return user?.emailVerified && user.role === 'admin' ? 'pass' : 'not_found'
  if (!user) return { redirect: loginPath(`${pathname}${search}`) }
  if (!user.emailVerified) return { redirect: '/login?error=unverified' }
  return 'pass'
}

function withCookies(target: NextResponse, from: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}

export async function proxyGate(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl
  const gate = gateFor(pathname)
  if (!gate) return updateSession(request)
  const configured = Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { user, response } = hasSessionCookie(request) && configured
    ? await currentUser(request)
    : { user: null, response: () => NextResponse.next({ request }) }
  const verdict = decide(gate, user, pathname, search)
  if (verdict === 'pass') return response()
  if (verdict === 'not_found') return withCookies(notFoundResponse(), response())
  return withCookies(NextResponse.redirect(new URL(verdict.redirect, request.url)), response())
}

