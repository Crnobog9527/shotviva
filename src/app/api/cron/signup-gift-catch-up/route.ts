import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { catchUpSignupGifts } from '@/core/auth/signup-gift-catch-up'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'

// Called by Vercel cron with its bearer credential, independently of user sessions, every day at
// 16:05 UTC, just after the Beijing day (and its signup gift cap) starts: pays signup gifts the
// daily cap left pending, oldest first, at most 50 per run, one transaction per account, within
// today's cap (migration 2026, ARCHITECTURE §7). A grant that failed is logged and answered 500 so it is seen; the next run
// retries it.
export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  try {
    const result = await catchUpSignupGifts(createAdminSupabase())
    logger.info('signup gift catch-up', result)
    if (result.failed === 0) return new Response(null, { status: 204 })
    logger.error('signup gift catch-up incomplete', { failed: result.failed })
    return new Response(null, { status: 500 })
  } catch (error) {
    logger.error('signup gift catch-up failed', { error })
    return new Response(null, { status: 500 })
  }
}
