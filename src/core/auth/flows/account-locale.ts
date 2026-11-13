import 'server-only'
import type { NextRequest } from 'next/server'

import { isLocale } from '../../i18n/locales'
import { logger } from '../../logger'
import { assertSameOrigin } from '../api-guards'
import { getSessionUser } from '../session'
import { createSessionSupabase } from '../supabase-server'

export type AccountLocaleDeps = {
  sessionUser: typeof getSessionUser
  saveLocale: (locale: 'en' | 'zh') => Promise<void>
}

async function saveWithSession(locale: 'en' | 'zh'): Promise<void> {
  const supabase = await createSessionSupabase()
  const { error } = await supabase.auth.updateUser({ data: { locale } })
  // A failed save only means the emails and the next device keep the old language.
  if (error) logger.warn('could not store the account language', { code: error.code })
}

const defaults: AccountLocaleDeps = { sessionUser: getSessionUser, saveLocale: saveWithSession }

// POST /api/locale (body: "en" | "zh"), sent by the language switches as a beacon next to the
// NEXT_LOCALE cookie (ARCHITECTURE §17): a signed-in account keeps the choice in
// user_metadata.locale, which the emails and other devices read. Anyone else gets the same
// empty answer, so the beacon tells nothing about who is signed in.
export async function handleAccountLocale(request: NextRequest, deps: AccountLocaleDeps = defaults): Promise<Response> {
  assertSameOrigin(request)
  const locale = (await request.text()).trim()
  if (!isLocale(locale)) return new Response(null, { status: 400 })
  const user = await deps.sessionUser()
  if (user && user.locale !== locale) await deps.saveLocale(locale)
  return new Response(null, { status: 204 })
}
