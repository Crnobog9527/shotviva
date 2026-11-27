import 'server-only'
import { after, type NextRequest, type NextResponse } from 'next/server'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { logger } from '../logger'
import { isAffiliateEnabled } from './feature'

const slug = z.string().regex(/^[a-z0-9-]{3,24}$/)
// 15 days (Owner 2026-11-27; was 60). First click wins inside the window.
const lifetime = 15 * 24 * 60 * 60
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
  // A cookie past the window (one the browser still keeps from the old 60-day lifetime, or a
  // malformed one) binds nothing, so it must not block a new partner's link either.
  if (!value.success || current(request.cookies.get('sv_ref')?.value) || !(await isAffiliateEnabled())) return
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

// Email sign-up (flows/sign-up.ts): this browser's partner onto the account Supabase returned, so
// the first verified sign-in binds it even from a browser without the cookie (2021, ARCHITECTURE
// §6.5). Called after every successful sign-up form: without a current cookie it clears the row,
// so an earlier attempt for the same address (by anyone) never outlives this one. The SQL stores
// only for a just-created, unconfirmed account. Never fails the sign-up.
export async function storeSignupReferral(user: string | null | undefined, cookie: string | undefined) {
  if (!user) return
  try {
    const { error } = await createAdminSupabase().rpc('affiliate_signup_ref_store', { p_user: user, p_slug: current(cookie)?.slug ?? null })
    if (error) logger.warn('affiliate signup referral unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate signup referral unavailable')
  }
}

// The slug stored at sign-up, removed as it is read (single use). The SQL drops one older than
// a day or from before the latest confirmation email. undefined when none or on error.
async function takeSignupReferral(user: string): Promise<string | undefined> {
  try {
    const { data, error } = await createAdminSupabase().rpc('affiliate_signup_ref_take', { p_user: user })
    if (error) logger.warn('affiliate signup referral unavailable', { code: error.code })
    return typeof data === 'string' && slug.safeParse(data).success ? data : undefined
  } catch {
    logger.warn('affiliate signup referral unavailable')
    return undefined
  }
}

async function bindSlug(user: string, value: string, source: 'signup' | 'first_checkout') {
  // The RPC checks the switch in the same transaction as the write.
  try {
    const { error } = await createAdminSupabase().rpc('affiliate_bind', { p_user: user, p_slug: value, p_source: source })
    if (error) logger.warn('affiliate binding unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate binding unavailable')
  }
}

// The account's first verified sign-in (core/auth/first-sign-in.ts). The stored slug is taken on
// every first sign-in, also one that does not bind (`bind` false: a staff sign-up) or may not use
// it (`useStored` false: anything but the click on a signup confirmation link, such as a password
// reset on an unconfirmed account or Google), so it can never bind later. This browser's current
// cookie wins; the stored slug is only the fallback when there is none (the confirmation link
// opened on another device). The cookie's own timestamp is never compared with anything: it is
// unsigned (review on #961).
export async function bindSignupReferral(user: string, bind: boolean, cookie: string | undefined, useStored: boolean) {
  const stored = await takeSignupReferral(user)
  if (!bind) return
  const own = current(cookie)
  const value = own?.slug ?? (useStored ? stored : undefined)
  if (value) await bindSlug(user, value, 'signup')
}

export async function bindReferral(user: string, cookie: string | undefined, source: 'signup' | 'first_checkout') {
  const ref = current(cookie)
  if (ref) await bindSlug(user, ref.slug, source)
}
