import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

import { publicEnv } from '../public-env'
import { withDbTiers } from '../templates/db-resolution'
import { bearerClient } from './bearer-client'
import { cookieToken } from './cookie-token'

const env = () => ({ url: publicEnv.NEXT_PUBLIC_SUPABASE_URL, anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY })

// Session-bound data client for pages, Server Actions and route handlers: every query runs as the
// signed-in user (RLS applies) with the access token from the request's cookie, and nothing ever
// refreshes the session here (bearer-client.ts). The proxy refreshed it on the way in; a token it
// could not refresh simply fails its queries (the page shows its retry state) instead of being
// refreshed where the rotated cookies would be lost.
export async function createServerSupabase() {
  // Reading the token checks the clock; Cache Components requires the render to be request-time first.
  await connection()
  const found = await cookieToken((await cookies()).getAll(), env().url)
  return bearerClient(env(), found?.token ?? null)
}

// Only for the flows that change the session itself (sign in and out, sign-up, OTP, password and
// metadata updates, account deletion), which run in Server Actions and route handlers where the
// rotated or cleared cookies can be written. Never from a Server Component.
export async function createSessionSupabase() {
  await connection()
  const cookieStore = await cookies()
  return createServerClient(env().url, env().anonKey, {
    global: { fetch: withDbTiers() },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component by mistake: the write cannot happen there.
        }
      },
    },
  })
}
