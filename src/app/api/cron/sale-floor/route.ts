import { checkSaleFloor } from '@/core/alerts'
import { authorizedCron } from '@/core/cron/authorized'
import { logger } from '@/core/logger'

// Vercel cron every 10 minutes (1295, ARCHITECTURE §6.1): tells the Owner in Feishu when published
// templates are missing from the catalogue (most often a 1K price below the route's cost floor).
// A settled job runs the same check; this catches the rest (an edited provider, a dropped price).
// Bearer CRON_SECRET only. Without the Feishu settings nothing is read (hidden: null).
export const maxDuration = 60

export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  const hidden = await checkSaleFloor()
  logger.info('sale_floor.check', { hidden })
  return Response.json({ hidden })
}
