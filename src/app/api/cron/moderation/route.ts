import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'
import { liveModerationDeps, moderationKey, sweepModeration } from '@/core/moderation'

// Vercel cron every 10 minutes (ARCHITECTURE §9 第 5 条): screens public works not screened yet,
// retrying failures and backfilling older works. Bearer CRON_SECRET only, no user session.
export const maxDuration = 300

export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  if (!moderationKey()) {
    // Safe (nothing goes public unscreened) but every work then waits for a person.
    logger.warn('moderation.no_key', { hint: 'set OPENAI_MODERATION_API_KEY or OPENAI_API_KEY' })
    return Response.json({ seen: 0, screened: 0, key: false })
  }
  try {
    const result = await sweepModeration(liveModerationDeps())
    logger.info('moderation.sweep', result)
    return Response.json(result)
  } catch (error) {
    logger.error('moderation.sweep_failed', { error })
    return new Response(null, { status: 500 })
  }
}
