import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'
import { runMonthlyTopup, topupPeriod } from '@/core/org'

// Called by Vercel cron with its bearer credential, independently of user sessions: tops org
// members up to their monthly allowance for the current UTC month (ARCHITECTURE §6.5). Re-running
// a month grants nothing twice, so a failed run is simply called again.
export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  try {
    const summary = await runMonthlyTopup(createAdminSupabase(), topupPeriod(new Date()))
    logger.info('org monthly topup', summary)
    return new Response(null, { status: 204 })
  } catch (error) {
    logger.error('org monthly topup failed', { error })
    return new Response(null, { status: 500 })
  }
}
