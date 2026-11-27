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

// The account's first verified sign-in (`first`) takes the stored code once, also when it may
// not use it, so it can never apply later. Only a new account that may get signup benefits
// (`fresh`: not a staff sign-up) redeems: this browser's code first, else the stored one, and the
// stored one only on the click of the signup confirmation link (`useStored`).
export async function consumeSignupCode(
  admin: SupabaseClient, userId: string, o: { first: boolean; fresh: boolean; useStored: boolean },
  invite: InviteConfig, locale: Locale,
) {
  try {
    const jar = await cookies()
    const raw = jar.get(CODE_COOKIE)?.value
    if (raw) jar.delete(CODE_COOKIE)
    const stored = o.first ? await takeSignupCode(admin, userId) : null
    if (!o.fresh) return null
    const code = normalizeCode(raw) ?? (o.useStored ? stored : null)
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
