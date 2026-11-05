import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

import { publicEnv } from '../public-env'

// Session-bound client: every query runs as the signed-in user, so RLS applies.
export async function createServerSupabase() {
  // supabase-js reads Date.now() while loading the session; Cache Components requires the
  // render to be marked request-time before that happens.
  await connection()
  const cookieStore = await cookies()
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot write cookies; src/proxy.ts refreshes the session instead.
        }
      },
    },
  })
}
