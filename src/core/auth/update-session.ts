import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '../public-env'
import { withDbTiers } from '../templates/db-resolution'
import { authUnavailable } from './identity'

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

// What the proxy finally answers with for a request it lets through: a plain pass-through,
// or the locale router's rewrite into the [locale] tree.
export type Forward = (request: NextRequest) => NextResponse

export const forwardRequest: Forward = (request) => NextResponse.next({ request })

export function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => SESSION_COOKIE.test(name))
}

export function withCookies(target: NextResponse, from: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}

// A request-scoped client whose refreshed cookies land on `response()`. Server Components
// cannot write cookies, so the token refresh (and its rotated cookies) happens in the proxy.
// The rotated cookies are also written into the request itself, which every forward copies.
// `discard()` undoes cookie deletions from a refresh that failed: on a 429 with an expired access
// token the SDK deletes the session cookies as if the refresh token were dead, but nothing was
// rotated, so the browser keeps its cookies and the next request tries again (ARCHITECTURE §7
// 「会话校验」). Once a refresh has written a new session it is never undone, whatever fails after
// it (session_identity() timing out, say): dropping rotated cookies would leave the browser with
// a refresh token Auth already used.
export function proxySupabase(request: NextRequest) {
  const original = request.cookies.getAll()
  let rotated = false
  let response = NextResponse.next({ request })
  const supabase = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch: withDbTiers() },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        if (cookiesToSet.some(({ value }) => value !== '')) rotated = true
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  // Through request.cookies, which keeps its parsed copy and the Cookie header in step.
  const discard = () => {
    if (rotated) return
    request.cookies.getAll().forEach(({ name }) => {
      if (!original.some((cookie) => cookie.name === name)) request.cookies.delete(name)
    })
    original.forEach(({ name, value }) => request.cookies.set(name, value))
    response = NextResponse.next({ request })
  }
  return { supabase, response: () => response, discard }
}

// Visitors without a session cookie skip the session work, keeping marketing pages fast. With a
// cookie, getClaims() refreshes an expired session (the only Auth call, its rotated cookies land
// on the response) and otherwise checks the token locally against the JWKS: no Auth round trip.
// Who the visitor is gets decided where it matters, by the page or route (identity.ts).
export async function updateSession(request: NextRequest, forward: Forward = forwardRequest): Promise<NextResponse> {
  if (!hasSessionCookie(request) || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) return forward(request)
  const { supabase, response, discard } = proxySupabase(request)
  const { error } = await supabase.auth.getClaims()
  if (error && authUnavailable(error)) discard()
  return withCookies(forward(request), response())
}
