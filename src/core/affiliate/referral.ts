import 'server-only'
import { after, type NextRequest, type NextResponse } from 'next/server'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { logger } from '../logger'
import { isAffiliateEnabled } from './feature'

const slug = z.string().regex(/^[a-z0-9-]{3,24}$/)
// How long a referral link click is remembered (shown on the program page).
export const REFERRAL_COOKIE_DAYS = 60
const lifetime = REFERRAL_COOKIE_DAYS * 24 * 60 * 60
const now = () => Math.floor(Date.now() / 1000)

async function countClick(value: string) {
  try {
    const { error } = await createAdminSupabase().rpc('affiliate_count_click', { p_slug: value })
    if (error) logger.warn('affiliate click unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate click unavailable')
  }
}

export async function recordReferral(request: NextRequest, response: NextResponse) {
  const value = slug.safeParse(request.nextUrl.searchParams.get('ref'))
  if (!value.success || request.cookies.has('sv_ref') || !(await isAffiliateEnabled())) return
  response.cookies.set('sv_ref', value.data + '.' + now(), {
    maxAge: lifetime, path: '/', sameSite: 'lax', secure: true, httpOnly: true,
  })
  after(() => countClick(value.data))
}

export async function bindReferral(user: string, cookie: string | undefined, source: 'signup' | 'first_checkout') {
  if (!cookie) return
  const match = /^([a-z0-9-]{3,24})\.(\d{1,12})$/.exec(cookie)
  if (!match) return
  const age = now() - Number(match[2])
  if (age < 0 || age >= lifetime) return
  // The RPC checks the switch in the same transaction as the write.
  try {
    const { error } = await createAdminSupabase().rpc('affiliate_bind', { p_user: user, p_slug: match[1], p_source: source })
    if (error) logger.warn('affiliate binding unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate binding unavailable')
  }
}
