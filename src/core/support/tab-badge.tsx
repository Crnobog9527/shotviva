import 'server-only'

import { getTranslations } from 'next-intl/server'

import { createServerSupabase, getSessionUser } from '../auth'
import { logger } from '../logger'
import { hasUnreadReply } from './reads'
import { UnreadDot } from './ui/unread-dot'

// The Account tab's "new reply" dot, rendered by the app layout once per page load: no polling,
// no Realtime (AGENTS §5.1 rule 8). Signed out, or if the read fails, there is simply no dot.
export async function SupportTabBadge() {
  const user = await getSessionUser()
  if (!user) return null
  try {
    if (!(await hasUnreadReply(await createServerSupabase(), user.id))) return null
  } catch (error) {
    logger.warn('support.badge.failed', { error })
    return null
  }
  const t = await getTranslations('app.support')
  return <UnreadDot label={t('newReply')} tab />
}
