import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { withDbTiers } from '@/core/templates/db-resolution'

import { localSupabase } from './helpers'

// supabase-js clients on top of T2's localSupabase() (env, else `supabase status`), for code
// under test that takes a SupabaseClient. Same tier-id fetch as the app's clients.
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withDbTiers() } }

export function anonSupabase(): SupabaseClient {
  const { apiUrl, anonKey } = localSupabase()
  return createClient(apiUrl, anonKey, options)
}

export function serviceSupabase(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = localSupabase()
  return createClient(apiUrl, serviceRoleKey, options)
}
