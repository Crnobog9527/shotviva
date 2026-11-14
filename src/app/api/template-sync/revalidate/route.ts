import { revalidateTag } from 'next/cache'

import { bearerAuthorized } from '@/core/cron/authorized'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

// Called by the T93 sync workflow, never by a browser, so there is no user session: it is open to
// any caller holding TEMPLATE_SYNC_REVALIDATE_SECRET (Bearer, constant-time compare) and to no one
// else. After a sync the template catalogue cache expires at once ({ expire: 0 }, updateTag's
// effect in a route handler), so templates, series cards, member lists and the category tree all
// show the synced state on the next load instead of each catching up within the hour. POST only.
export async function POST(request: Request) {
  if (!bearerAuthorized(request, serverEnv().TEMPLATE_SYNC_REVALIDATE_SECRET)) return new Response(null, { status: 401 })
  revalidateTag(TEMPLATES_CACHE_TAG, { expire: 0 })
  logger.info('templates.sync_revalidated')
  return Response.json({ revalidated: TEMPLATES_CACHE_TAG })
}
