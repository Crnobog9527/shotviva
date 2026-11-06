import 'server-only'

import { getTranslations } from 'next-intl/server'

import { createAdminSupabase } from '../auth'
import { currentTier, limitsFor, TIER_LIMITS } from '../billing'
import { logger } from '../logger'

// The reply time the user is promised, by their tier right now (TIER_LIMITS.supportHours,
// ARCHITECTURE §6.2: Starter and Pro 48 hours, Max 24; no tier counts as Starter). Everyone but Max also reads what Max gets. If the tier read
// fails, the base time is shown: it is never shorter than what the user actually gets.
export async function ReplyTime({ userId }: { userId: string }) {
  const [tier, t] = await Promise.all([
    currentTier(createAdminSupabase(), userId).catch((error: unknown) => {
      logger.warn('support.reply_time.tier_failed', { error })
      return null
    }),
    getTranslations('app.support'),
  ])
  const line = t('replyTime', { hours: limitsFor(tier).supportHours })
  return tier === 'max' ? line : `${line} ${t('replyTimeMax', { hours: TIER_LIMITS.max.supportHours })}`
}
