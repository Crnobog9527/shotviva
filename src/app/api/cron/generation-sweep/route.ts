import { createAdminSupabase } from '@/core/auth'
import { callRpc } from '@/core/billing/rpc'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'
import { z } from 'zod'

// Vercel cron every minute (queue-fairness Q3, SQL 1700): refunds generation jobs still 'running'
// 15 minutes after they started, when no function can still be settling them (the longest
// generation function lives 300 s), and drops lane slot rows nobody counts any more. Before this a
// job whose function died kept its credits reserved for good. Bearer CRON_SECRET only.
export const maxDuration = 60

const STALE_AFTER = '15 minutes'

export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  const refunded = await callRpc(createAdminSupabase(), 'sweep_stale_generation_jobs', { p_older_than: STALE_AFTER, p_limit: 50 }, z.number().int())
  if (refunded > 0) logger.warn('generation.sweep.refunded', { refunded })
  return Response.json({ refunded })
}
