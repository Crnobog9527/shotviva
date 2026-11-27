import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { splitLocale } from '../i18n/paths'
import { logger } from '../logger'
import { sanitizeNext } from './redirect-target'

// Staff accounts (Owner 2026-11-22, ARCHITECTURE §6.5): an account that signs up through an org's
// internal staff link (/join/org/<invite token>, which sends a signed-out visitor to sign-up with
// that page as `next`) gets no free signup credits. It works from the org's pools; once the org
// removes it, it is an ordinary account. Only an active org's link counts, so a made-up link or a
// suspended org's costs nobody their gift.

const STAFF_PATH = /^\/join\/org\/([0-9a-f]{32})\/?$/

export function staffJoinToken(next: string | null | undefined): string | null {
  const target = sanitizeNext(next)
  const pathname = target.split('?')[0] ?? ''
  return STAFF_PATH.exec(splitLocale(pathname).path)?.[1] ?? null
}

// Where a sign-up came from survives a resent confirmation email or SMS code (Codex P1 on #841):
// sign-up stores the staff link's token, and the id of the org it belonged to, in user_metadata
// (flows/sign-up.ts, flows/phone.ts). A later confirmation built on the ordinary login page,
// whose `next` is /account, still counts, and so does one after the org reset its link: the org
// id is what decides. The account can write its own metadata, but setting it only ever costs
// itself the gift.
export const STAFF_INVITE_KEY = 'staff_invite'
export const STAFF_ORG_KEY = 'staff_org'

const TOKEN = /^[0-9a-f]{32}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type MetadataUser = { user_metadata?: Record<string, unknown> | null }
export type StaffOrigin = { token: string | null; orgId: string | null }

function metadataValue(user: MetadataUser, key: string, shape: RegExp): string | null {
  const value = user.user_metadata?.[key]
  return typeof value === 'string' && shape.test(value) ? value : null
}

// The staff origin this sign-in carries: the token in its `next`, else the one stored at sign-up,
// plus the org id stored at sign-up. null when it carries none.
export function staffOriginFor(next: string | null | undefined, user: MetadataUser): StaffOrigin | null {
  const token = staffJoinToken(next) ?? metadataValue(user, STAFF_INVITE_KEY, TOKEN)
  const orgId = metadataValue(user, STAFF_ORG_KEY, UUID)
  return token || orgId ? { token, orgId } : null
}

async function activeOrgBy(admin: SupabaseClient, column: 'id' | 'invite_token', value: string) {
  return admin.from('orgs').select('id').eq(column, value).eq('status', 'active').maybeSingle<{ id: string }>()
}

// What a sign-up from a staff link stores on the new account: the token, and the active org it
// belongs to. A failed lookup stores the token alone (the sign-in checks again); an unknown or
// suspended org's link stores nothing.
export async function staffSignupData(admin: SupabaseClient, next: string | null | undefined): Promise<Record<string, string>> {
  const token = staffJoinToken(next)
  if (!token) return {}
  const { data, error } = await activeOrgBy(admin, 'invite_token', token)
  if (error) {
    logger.warn('staff signup org lookup failed', { code: error.code })
    return { [STAFF_INVITE_KEY]: token }
  }
  return data ? { [STAFF_INVITE_KEY]: token, [STAFF_ORG_KEY]: data.id } : {}
}

// Whether the origin points at an active org: by the org id stored at sign-up (a link reset since
// still counts), else by the token. 'error' when the lookup failed: the caller then pays no gift
// on this sign-in rather than risk paying a staff account (logged); a later one checks again.
export async function isStaffSignup(admin: SupabaseClient, origin: StaffOrigin | null): Promise<boolean | 'error'> {
  if (!origin) return false
  for (const [column, value] of [['id', origin.orgId], ['invite_token', origin.token]] as const) {
    if (!value) continue
    const { data, error } = await activeOrgBy(admin, column, value)
    if (error) {
      logger.warn('staff signup check failed', { code: error.code })
      return 'error'
    }
    if (data) return true
  }
  return false
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
// 'unchecked': the org lookup failed. Nothing is marked and no gift is paid on this sign-in; the
// caller also leaves the signup IP unrecorded, so the next sign-in is still the account's "first"
// for mark_staff_signup (1950) and decides.
export async function staffSignup(admin: SupabaseClient, userId: string, origin: StaffOrigin | null): Promise<boolean | 'unchecked'> {
  const staff = await isStaffSignup(admin, origin)
  if (staff === 'error') return 'unchecked'
  if (!staff) return false
  return (await markStaffSignup(admin, userId)) !== false
}
