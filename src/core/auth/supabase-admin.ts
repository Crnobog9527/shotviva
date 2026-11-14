import 'server-only'
import { createClient } from '@supabase/supabase-js'

import { withDbTiers } from '../templates/db-resolution'
import { serverEnv } from '../env'
import { AppError } from '../errors'
import { publicEnv } from '../public-env'

// Service-role client: bypasses RLS. Only for SQL functions (credits) and auth admin calls.
export function createAdminSupabase() {
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new AppError('INTERNAL', 'SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: withDbTiers() },
  })
}
