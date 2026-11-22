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

// Where a sign-up came from survives a resent confirmation email (Codex P1 on #841): sign-up
// stores the staff link's token in user_metadata.staff_invite (flows/sign-up.ts), so a later
// confirmation link built on the ordinary login page, whose `next` is /account, still counts.
// The account can write its own metadata, but setting it only ever costs itself the gift.
export const STAFF_INVITE_KEY = 'staff_invite'

export function staffInviteOf(user: { user_metadata?: Record<string, unknown> | null }): string | null {
  const value = user.user_metadata?.[STAFF_INVITE_KEY]
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value) ? value : null
}

// The staff link token this sign-in carries: in its `next`, else the one stored at sign-up.
export function staffTokenFor(next: string | null | undefined, user: { user_metadata?: Record<string, unknown> | null }): string | null {
  return staffJoinToken(next) ?? staffInviteOf(user)
}

// A lookup failure grants the gift as before (a sign-in never fails over it); it is logged.
export async function isStaffSignup(admin: SupabaseClient, token: string | null): Promise<boolean> {
  if (!token) return false
  const { data, error } = await admin.from('orgs').select('id').eq('invite_token', token).eq('status', 'active').maybeSingle()
  if (error) {
    logger.warn('staff signup check failed', { code: error.code })
    return false
  }
  return data !== null
}

// Stores the refusal 'staff' on the account (1940, 1950), so no later sign-in, claim or removal
// from the org pays the gift. true: marked now or before; false: nothing written (the gift was
// paid, or another refusal such as a pending same-IP one stands); null: the call failed (logged).
// Tried twice: a mark that never lands lets a later sign-in pay the gift.
export async function markStaffSignup(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await admin.rpc('mark_staff_signup', { p_user_id: userId })
    if (!error) return data === true
    if (attempt === 2) logger.error('staff signup mark failed', { userId, code: error.code })
  }
  return null
}

// Whether this sign-in is a staff-link sign-up: headed for an active org's staff link, and the SQL
// marked the account (1950: only a new account, never paid and never refused otherwise). An
// existing account that signs in through the link, say before joining, keeps its gift, paid or
// pending (Codex P1 on #841). A staff sign-up gets no gift, no signup code and no partner binding.
// A failed mark still counts for this sign-in, so nothing is paid now; it is logged.
export async function staffSignup(admin: SupabaseClient, userId: string, token: string | null): Promise<boolean> {
  if (!(await isStaffSignup(admin, token))) return false
  return (await markStaffSignup(admin, userId)) !== false
}
