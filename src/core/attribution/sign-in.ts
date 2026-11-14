import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'
import { FIRST_TOUCH_COOKIE } from './first-touch'
import { openTouch } from './seal'

// At a verified sign-in (ARCHITECTURE §16.6), the same place the A/B assignment is stored: the
// browser's sealed first touch goes onto the account once (record_first_touch, 1547). A cookie that
// is missing, forged or malformed writes nothing. Never throws: a sign-in must not fail for it.
export async function recordFirstTouchAtSignIn(admin: SupabaseClient, userId: string, cookie: string | undefined, secret: string | undefined): Promise<void> {
  const touch = secret ? openTouch(cookie, secret) : null
  if (!touch) return
  try {
    const { error } = await admin.rpc('record_first_touch', { p_user: userId, p_touch: touch })
    if (error) throw new Error(error.message)
  } catch (error) {
    logger.warn('attribution.first_touch_write_failed', { error })
  }
}

export { FIRST_TOUCH_COOKIE }
