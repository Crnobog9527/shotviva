import 'server-only'

import { redirect, unstable_rethrow } from 'next/navigation'

import { getSessionUser, signedInTarget } from '@/core/auth'
import type { Locale } from '@/core/i18n'
import { logger } from '@/core/logger'

// /login and /signup never show their form to someone already signed in (DESIGN §6.9 item 4):
// they go to their `next`, or to the app. Unverified accounts stay (the login page explains
// ?error=unverified). A failed session read shows the form rather than an error page.
export async function redirectIfSignedIn(rawNext: string | null, locale: Locale): Promise<void> {
  let verified = false
  try {
    verified = (await getSessionUser())?.verified === true
  } catch (error) {
    unstable_rethrow(error)
    logger.error('auth.session_read_failed', { error })
  }
  if (verified) redirect(signedInTarget(rawNext, locale))
}
