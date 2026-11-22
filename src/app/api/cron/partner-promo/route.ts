import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { runPartnerPromo, promoPeriod } from '@/core/affiliate/promo-run'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'

// Called by Vercel cron with its bearer credential, independently of user sessions, on the 1st of
// each month (UTC): expires last month's channel partner promotion credits and writes this month's
// pending grant sheets (ARCHITECTURE §6.5 渠道商推广积分). Nothing is granted here; an admin confirms
// each sheet. Re-running a month changes nothing decided, so a failed run is simply called again.
export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  try {
    const { failed_orgs: failedOrgs, failed_expiries: failedExpiries, ...result } = await runPartnerPromo(createAdminSupabase(), promoPeriod(new Date()))
    logger.info('partner promo run', result)
    if (failedOrgs.length === 0 && failedExpiries.length === 0) return new Response(null, { status: 204 })
    logger.error('partner promo run failed for some partners', { failedOrgs, failedExpiries })
    return new Response(null, { status: 500 })
  } catch (error) {
    logger.error('partner promo run failed', { error })
    return new Response(null, { status: 500 })
  }
}
