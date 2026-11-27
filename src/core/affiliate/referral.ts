import 'server-only'
import { after, type NextRequest, type NextResponse } from 'next/server'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { logger } from '../logger'
import { isAffiliateEnabled } from './feature'

const slug = z.string().regex(/^[a-z0-9-]{3,24}$/)
const lifetime = 60 * 24 * 60 * 60
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

// The cookie's `<slug>.<unix seconds>`, if well formed and still inside the cookie's lifetime.
function current(value: string | null | undefined) {
  const match = value ? /^([a-z0-9-]{3,24})\.(\d{1,12})$/.exec(value) : null
  if (!match) return null
  const at = Number(match[2])
  const age = now() - at
  return age < 0 || age >= lifetime ? null : { slug: match[1]!, at }
}

// Of the referral this browser carries and the one stored at sign-up (another browser's, when the
// verification link is opened elsewhere), the one set first: the partner who reached the visitor
// first keeps them, as with the cookie alone (recordReferral never replaces one).
export function earliestReferral(...values: (string | null | undefined)[]): string | undefined {
  let best: { value: string; at: number } | undefined
  for (const value of values) {
    const ref = current(value)
    if (ref && (!best || ref.at < best.at)) best = { value: value!, at: ref.at }
  }
  return best?.value
}

// Email sign-up (flows/sign-up.ts): the cookie onto the account Supabase just created, so the
// first verified sign-in binds it even from a browser without it (2021, ARCHITECTURE §6.5).
// The SQL stores only for a just-created, unconfirmed account and keeps the first value.
// Never fails the sign-up.
export async function storeSignupReferral(user: string | null | undefined, cookie: string | undefined) {
  if (!user || !cookie || !current(cookie)) return
  try {
    const { error } = await createAdminSupabase().rpc('affiliate_signup_ref_store', { p_user: user, p_ref: cookie })
    if (error) logger.warn('affiliate signup referral unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate signup referral unavailable')
  }
}

// The value stored at sign-up, removed as it is read (single use). undefined when none or on error.
export async function takeSignupReferral(user: string): Promise<string | undefined> {
  try {
    const { data, error } = await createAdminSupabase().rpc('affiliate_signup_ref_take', { p_user: user })
    if (error) logger.warn('affiliate signup referral unavailable', { code: error.code })
    return typeof data === 'string' ? data : undefined
  } catch {
    logger.warn('affiliate signup referral unavailable')
    return undefined
  }
}

export async function bindReferral(user: string, cookie: string | undefined, source: 'signup' | 'first_checkout') {
  const ref = current(cookie)
  if (!ref) return
  // The RPC checks the switch in the same transaction as the write.
  try {
    const { error } = await createAdminSupabase().rpc('affiliate_bind', { p_user: user, p_slug: ref.slug, p_source: source })
    if (error) logger.warn('affiliate binding unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate binding unavailable')
  }
}
