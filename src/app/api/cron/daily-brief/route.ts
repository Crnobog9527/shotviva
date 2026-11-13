import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'
import { sendDailyBrief } from '@/core/ops-brief/load'

// Vercel cron once a day at 14:00 UTC = 22:00 Beijing (decision D12): the Owner's daily brief in
// the Feishu alert group, today so far against yesterday's same hours. Read-only; without the
// Feishu settings nothing is read. Bearer CRON_SECRET only.
export const maxDuration = 60

export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  const outcome = await sendDailyBrief()
  logger.info('ops_brief.run', { outcome })
  return Response.json({ outcome }, { status: outcome === 'failed' ? 500 : 200 })
}
