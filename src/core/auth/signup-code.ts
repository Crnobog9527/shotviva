import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import { CODE_COOKIE, codeCookieOptions, normalizeCode, type InviteConfig } from '../codes'
import { redeemCode } from '../codes/server'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'

export type SignupBenefits = { freeCredits: number; invite: InviteConfig }

// Email sign-up (flows/sign-up.ts): the code typed in the form (or carried by a ?code= link) onto
// the account Supabase returned, so a confirmation opened on another device still applies it
// (2030, the 2021 pattern; ARCHITECTURE §6.4). Every successful form replaces or clears the row;
// the SQL stores only for a just-created, unconfirmed account. Never fails the sign-up.
export async function storeSignupCode(admin: SupabaseClient, user: string | null | undefined, code: string | null) {
  if (!user) return
  try {
    const { error } = await admin.rpc('signup_code_store', { p_user: user, p_code: code })
    if (error) logger.warn('signup code could not be stored', { code: error.code })
  } catch {
    logger.warn('signup code could not be stored')
  }
}

async function takeSignupCode(admin: SupabaseClient, user: string): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('signup_code_take', { p_user: user })
    if (error) logger.warn('signup code could not be taken', { code: error.code })
    return normalizeCode(data)
  } catch {
    logger.warn('signup code could not be taken')
    return null
  }
}

// The code a sign-up form submits: its own field when it has one (an emptied field means none),
// else the one a ?code= link left in this browser. Server-held: the database decides what it is.
export async function submittedSignupCode(form: FormData): Promise<string | null> {
  if (form.has('signupCode')) return normalizeCode(form.get('signupCode'))
  return normalizeCode((await cookies()).get(CODE_COOKIE)?.value)
}

// This browser's code, else the one stored at email sign-up (only on the click of the signup
// confirmation link, `useStored`). The cookie is cleared and the stored row taken (single use),
// also when the code may not apply (`fresh` false: a staff sign-up), so it can never apply later.
async function resolveSignupCode(admin: SupabaseClient, userId: string, o: { first: boolean; fresh: boolean; useStored: boolean }) {
  const jar = await cookies()
  const raw = jar.get(CODE_COOKIE)?.value
  if (raw) jar.delete(CODE_COOKIE)
  const stored = o.first ? await takeSignupCode(admin, userId) : null
  if (!o.fresh) return null
  return normalizeCode(raw) ?? (o.useStored ? stored : null)
}

async function stage(admin: SupabaseClient, userId: string, code: string | null) {
  try {
    const { error } = await admin.rpc('signup_code_stage', { p_user: userId, p_code: code })
    if (error) logger.warn('signup code could not be staged', { code: error.code })
  } catch {
    logger.warn('signup code could not be staged')
  }
}

// A first sign-in known before the gift (2031): the code is resolved and staged first, so an org
// staff member's invite code gets the org channel's per-network gift allowance (grant_credits
// reads the staged code; the database decides whether it is one). Pass the result to
// consumeSignupCode as `prepared`. Never fails the sign-in.
export async function prepareSignupCode(admin: SupabaseClient, userId: string, useStored: boolean): Promise<string | null> {
  try {
    const code = await resolveSignupCode(admin, userId, { first: true, fresh: true, useStored })
    if (code) await stage(admin, userId, code)
    return code
  } catch {
    logger.warn('signup code could not be prepared')
    return null
  }
}

// The account's first verified sign-in (`first`) takes the stored code once, also when it may
// not use it, so it can never apply later. Only a new account that may get signup benefits
// (`fresh`: not a staff sign-up) redeems: this browser's code first, else the stored one, and the
// stored one only on the click of the signup confirmation link (`useStored`). With `prepared`
// (prepareSignupCode ran before the gift) that code is redeemed and its staging cleared.
export async function consumeSignupCode(
  admin: SupabaseClient, userId: string, o: { first: boolean; fresh: boolean; useStored: boolean; prepared?: string | null },
  invite: InviteConfig, locale: Locale,
) {
  try {
    const jar = await cookies()
    const code = o.prepared === undefined ? await resolveSignupCode(admin, userId, o) : o.fresh ? o.prepared : null
    if (o.prepared) await stage(admin, userId, null)
    if (!code) return null
    const claim = await redeemCode(admin, { userId, code, context: 'signup', invite, locale })
    if (claim.status === 'ok') {
      const { credits, pool, percent } = claim
      jar.set('sv_code_result', JSON.stringify({ credits, pool, percent }), { ...codeCookieOptions, httpOnly: false, maxAge: 120 })
    }
    return claim.kind
  } catch {
    logger.warn('signup code could not be applied')
    return null
  }
}
