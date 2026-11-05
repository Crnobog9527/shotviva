// Values printed by `supabase status -o env`; CI exports them with a SUPABASE_ prefix.
// Tests may read process.env directly: they are outside src/ and never ship.
export const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const API_URL = process.env.SUPABASE_API_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
