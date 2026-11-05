import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '../public-env'

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

// Called from src/proxy.ts. Server Components cannot write cookies, so the token refresh
// (and its rotated cookies) happens here before rendering. Visitors without a session
// cookie skip the Auth round trip entirely, keeping marketing pages fast.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const hasSession = request.cookies.getAll().some(({ name }) => SESSION_COOKIE.test(name))
  if (!hasSession || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) return response

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
  await supabase.auth.getUser()
  return response
}
