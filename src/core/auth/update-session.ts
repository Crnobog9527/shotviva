import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '../public-env'

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
export function proxySupabase(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  return { supabase, response: () => response }
}

// Visitors without a session cookie skip the session work, keeping marketing pages fast. With a
// cookie, getClaims() refreshes an expired session (the only Auth call, its rotated cookies land
// on the response) and otherwise checks the token locally against the JWKS: no Auth round trip.
// Who the visitor is gets decided where it matters, by the page or route (identity.ts).
export async function updateSession(request: NextRequest, forward: Forward = forwardRequest): Promise<NextResponse> {
  if (!hasSessionCookie(request) || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) return forward(request)
  const { supabase, response } = proxySupabase(request)
  await supabase.auth.getClaims()
  return withCookies(forward(request), response())
}
