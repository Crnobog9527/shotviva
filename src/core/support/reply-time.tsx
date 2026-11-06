import 'server-only'

import { getTranslations } from 'next-intl/server'

import { createAdminSupabase } from '../auth'
import { currentTier, supportHoursFor, TIER_SUPPORT_REPLY_HOURS } from '../billing'
import { logger } from '../logger'

// The reply time the user is promised, by their tier right now (ARCHITECTURE §6.2: Starter and
// Pro 48 hours, Max 24, no tier 48). Everyone but Max also reads what Max gets. If the tier read
// fails, the base time is shown: it is never shorter than what the user actually gets.
export async function ReplyTime({ userId }: { userId: string }) {
  const [tier, t] = await Promise.all([
    currentTier(createAdminSupabase(), userId).catch((error: unknown) => {
      logger.warn('support.reply_time.tier_failed', { error })
      return null
    }),
    getTranslations('app.support'),
  ])
  const line = t('replyTime', { hours: supportHoursFor(tier) })
  return tier === 'max' ? line : `${line} ${t('replyTimeMax', { hours: TIER_SUPPORT_REPLY_HOURS.max })}`
}
