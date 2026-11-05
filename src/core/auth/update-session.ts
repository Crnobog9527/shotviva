import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '../public-env'

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

export function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => SESSION_COOKIE.test(name))
}

// A request-scoped client whose refreshed cookies land on `response()`. Server Components
// cannot write cookies, so the token refresh (and its rotated cookies) happens in the proxy.
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

// Visitors without a session cookie skip the Auth round trip, keeping marketing pages fast.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!hasSessionCookie(request) || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.next({ request })
  const { supabase, response } = proxySupabase(request)
  await supabase.auth.getUser()
  return response()
}
