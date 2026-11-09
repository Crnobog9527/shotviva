import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import { CODE_COOKIE, codeCookieOptions, normalizeCode, type InviteConfig } from '../codes'
import { redeemCode } from '../codes/server'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'

export type SignupBenefits = { freeCredits: number; invite: InviteConfig }

export async function consumeSignupCode(admin: SupabaseClient, userId: string, first: boolean, invite: InviteConfig, locale: Locale) {
  try {
    const jar = await cookies()
    const raw = jar.get(CODE_COOKIE)?.value
    if (!raw) return null
    jar.delete(CODE_COOKIE)
    const code = normalizeCode(raw)
    if (!first || !code) return null
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
