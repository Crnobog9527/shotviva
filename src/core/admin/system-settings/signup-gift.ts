import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { settingValue, SIGNUP_GIFT_CREDITS_MAX, SIGNUP_GIFT_CREDITS_MIN } from '@/core/system-settings/registry'

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
})

// The stored amount (or its default, 200), never the one in effect: signup_gift_today().credits is 6
// on a database without the v2 cutover, and the form saves every rule at once, so pre-filling it
// would store 6 the first time another rule is saved.
async function storedGiftCredits(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.from('system_settings').select('value').eq('key', 'signup_gift_credits').maybeSingle<{ value: unknown }>()
  if (error) throw new AppError('INTERNAL', 'signup_gift_credits read failed', { cause: new Error(error.message) })
  return settingValue({ signup_gift_credits: data?.value }, 'signup_gift_credits')
}

export async function loadSignupGift(db: SupabaseClient): Promise<SignupGiftState> {
  const [today, paused, credits] = await Promise.all([db.rpc('signup_gift_today'), loadSettingSwitch(db, 'signup_gift_paused'), storedGiftCredits(db)])
  if (today.error) throw new AppError('INTERNAL', 'signup_gift_today failed', { cause: new Error(today.error.message) })
  const row = todaySchema.parse(today.data)
  return {
    granted: row.granted,
    rules: { credits, cap: row.cap, perIp: row.per_ip, claimPhone: row.claim_phone, claimGoogle: row.claim_google },
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
