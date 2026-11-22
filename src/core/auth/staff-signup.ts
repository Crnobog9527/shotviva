import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { splitLocale } from '../i18n/paths'
import { logger } from '../logger'
import { sanitizeNext } from './redirect-target'

// Staff accounts (Owner 2026-11-22, ARCHITECTURE §6.5): an account that signs up through an org's
// internal staff link (/join/org/<invite token>, which sends a signed-out visitor to sign-up with
// that page as `next`) gets no free signup credits. It works from the org's pools; once the org
// removes it, it is an ordinary account. Only a token of an active org counts, so a stale or
// made-up link costs nobody their gift.

const STAFF_PATH = /^\/join\/org\/([0-9a-f]{32})\/?$/

export function staffJoinToken(next: string | null | undefined): string | null {
  const target = sanitizeNext(next)
  const pathname = target.split('?')[0] ?? ''
  return STAFF_PATH.exec(splitLocale(pathname).path)?.[1] ?? null
}

// A lookup failure grants the gift as before (a sign-in never fails over it); it is logged.
export async function isStaffSignup(admin: SupabaseClient, next: string | null | undefined): Promise<boolean> {
  const token = staffJoinToken(next)
  if (!token) return false
  const { data, error } = await admin.from('orgs').select('id').eq('invite_token', token).eq('status', 'active').maybeSingle()
  if (error) {
    logger.warn('staff signup check failed', { code: error.code })
    return false
  }
  return data !== null
}

// Stores the refusal 'staff' on the account (1940), so no later sign-in, claim or removal from the
// org pays the gift. A failure is logged; the first attempt is still skipped by the caller.
export async function markStaffSignup(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.rpc('mark_staff_signup', { p_user_id: userId })
  if (error) logger.error('staff signup mark failed', { userId, code: error.code })
}

// The signup gift this sign-in may pay: 0 for a staff-link signup (marked so it stays 0).
export async function signupGiftFor(admin: SupabaseClient, userId: string, next: string | null | undefined, credits: number): Promise<number> {
  if (!(await isStaffSignup(admin, next))) return credits
  await markStaffSignup(admin, userId)
  return 0
}
