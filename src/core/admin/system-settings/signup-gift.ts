import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { SIGNUP_GIFT_CREDITS_MAX, SIGNUP_GIFT_CREDITS_MIN } from '@/core/system-settings/registry'

import { SIGNUP_GIFT_COPY } from '../features-editor/signup-gift-copy'
import { loadSettingSwitch, type SystemSettingDeps } from './commands'
import type { SignupGiftState } from './types'

// The signup gift's rules (1350, 1480, 2008, ARCHITECTURE §7) on /admin/features: the amount, the daily cap, how
// many gifts one network may receive in 24 hours, which ways a pending account may claim, and
// the pause. grant_credits and claim_signup_gift read the rows themselves, so a save applies to
// the next sign-up without any cache; the site's copy reads the amount through the settings
// cache, which the save expires.

const todaySchema = z.object({
  granted: z.number().int(),
  cap: z.number().int(),
  per_ip: z.number().int(),
  claim_phone: z.boolean(),
  claim_google: z.boolean(),
  credits: z.number().int(),
})

export async function loadSignupGift(db: SupabaseClient): Promise<SignupGiftState> {
  const [today, paused] = await Promise.all([db.rpc('signup_gift_today'), loadSettingSwitch(db, 'signup_gift_paused')])
  if (today.error) throw new AppError('INTERNAL', 'signup_gift_today failed', { cause: new Error(today.error.message) })
  const row = todaySchema.parse(today.data)
  return {
    granted: row.granted,
    rules: { credits: row.credits, cap: row.cap, perIp: row.per_ip, claimPhone: row.claim_phone, claimGoogle: row.claim_google },
    paused,
  }
}

export const signupGiftRulesSchema = z.object({
  credits: z.number().int().min(SIGNUP_GIFT_CREDITS_MIN).max(SIGNUP_GIFT_CREDITS_MAX),
  cap: z.number().int().min(0).max(100_000),
  perIp: z.number().int().min(0).max(1000),
  claimPhone: z.boolean(),
  claimGoogle: z.boolean(),
})

// One row per rule; the database checks the admin, the key and the range again.
export async function saveSignupGiftRules(deps: SystemSettingDeps, adminId: string, input: unknown): Promise<void> {
  const parsed = signupGiftRulesSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', SIGNUP_GIFT_COPY.rules.invalid)
  const rules = parsed.data
  const rows = [
    ['signup_gift_credits', rules.credits],
    ['signup_gift_daily_cap', rules.cap],
    ['signup_gift_per_ip', rules.perIp],
    ['signup_gift_claim_phone', rules.claimPhone],
    ['signup_gift_claim_google', rules.claimGoogle],
  ] as const
  for (const [key, value] of rows) {
    await callRpc(deps.db, 'admin_set_system_setting', { p_key: key, p_value: value, p_actor: adminId }, z.unknown())
  }
  deps.invalidate()
  logger.info('admin.system_settings.saved', { adminId, key: 'signup_gift_rules', ...rules })
}
