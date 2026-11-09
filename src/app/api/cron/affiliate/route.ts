import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'

// Called by Vercel cron with its bearer credential, independently of user sessions.
export async function GET(request: Request) {
  if (!authorizedCron(request)) {
    return new Response(null, { status: 401 })
  }
  const { error } = await createAdminSupabase().rpc('affiliate_daily', { p_today: new Date().toISOString().slice(0, 10) })
  if (error) logger.error('affiliate daily failed', { code: error.code })
  return new Response(null, { status: error ? 500 : 204 })
}
