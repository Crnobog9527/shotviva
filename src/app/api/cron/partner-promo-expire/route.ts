import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { expirePartnerPromo } from '@/core/affiliate/promo-run'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'

// Called by Vercel cron with its bearer credential, independently of user sessions, every day at
// 00:00 UTC: takes back the unspent channel partner promotion credits of every month that just
// ended, and settles refunds that landed after an expiry (ARCHITECTURE §6.5 渠道商推广积分). Running
// at midnight keeps the gap in which expired credits can still be spent short; running daily
// retries a failed pass. A failure, or a grant over an hour past its expiry still not taken back,
// is logged as an error and answered 500 so it is seen.
export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  try {
    const { failed, ...result } = await expirePartnerPromo(createAdminSupabase())
    logger.info('partner promo expiry', result)
    if (failed.length === 0 && result.overdue === 0) return new Response(null, { status: 204 })
    logger.error('partner promo expiry incomplete', { failed, overdue: result.overdue })
    return new Response(null, { status: 500 })
  } catch (error) {
    logger.error('partner promo expiry failed', { error })
    return new Response(null, { status: 500 })
  }
}
