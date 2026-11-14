import { createAdminSupabase } from '@/core/auth'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'
import { refundStalePhotos } from '@/core/poster/stale-photos'

// Vercel cron every 5 minutes (ARCHITECTURE §5.3「每周复用」): refunds charged 拍照识别 runs still
// pending after 10 minutes, whose server process died. Bearer CRON_SECRET only, no user session.
export const maxDuration = 60

export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  try {
    const result = await refundStalePhotos(createAdminSupabase())
    if (result.refunded || result.skipped) logger.warn('poster.photo.stale_refunded', result)
    else logger.info('poster.photo.stale_sweep', result)
    return Response.json(result)
  } catch (error) {
    logger.error('poster.photo.stale_sweep_failed', { error })
    return new Response(null, { status: 500 })
  }
}
