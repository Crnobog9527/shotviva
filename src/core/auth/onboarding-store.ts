import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'
import { onboardingPatch, readOnboarding, type OnboardingFlag } from './onboarding'

// Marks one first-run hint as seen for `userId`, which the caller takes from the session, never
// from the request. `db` is the service-role client. The current metadata is read fresh so a
// flag set on another device is kept; a flag already set costs no write. A failed write only
// means the hint may show once more, so it is logged and swallowed.
export async function markOnboardingSeen(db: SupabaseClient, userId: string, flag: OnboardingFlag): Promise<void> {
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error || !data.user) {
    logger.warn('onboarding.read_failed', { code: error?.code })
    return
  }
  const metadata: unknown = data.user.user_metadata
  if (readOnboarding(metadata)[flag]) return
  const write = await db.auth.admin.updateUserById(userId, { user_metadata: onboardingPatch(metadata, flag) })
  if (write.error) logger.warn('onboarding.write_failed', { code: write.error.code })
}
