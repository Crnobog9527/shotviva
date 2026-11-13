import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// A client that carries one access token and nothing else: no session storage, no refresh. Every
// query runs as that token's user (RLS applies), or as anon without one. Refreshing is the
// proxy's job alone: anywhere else a refresh rotates the refresh token while the new cookies may
// never reach the browser (ARCHITECTURE §7「会话校验」). `autoRefreshToken: false` alone would not
// do: the SDK still refreshes a near-expiry session whenever a query asks it for the token.
export function bearerClient(env: { url: string; anonKey: string }, token: string | null): SupabaseClient {
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  })
}
