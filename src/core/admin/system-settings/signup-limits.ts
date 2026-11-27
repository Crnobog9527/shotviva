import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { IP_LIMIT_MAX, IP_LIMIT_MIN } from '@/core/system-settings/registry'

import { SIGNUP_LIMITS_COPY } from '../features-editor/signup-limits-copy'
import type { SystemSettingDeps } from './commands'
import type { SignupLimits } from './types'

// 2027 (ARCHITECTURE §7): the per-IP limits on sign-up requests and SMS codes on /admin/features,
// site-wide and through an org partner's ?ref link. signup_request, sms_request_send and
// sms_authorize_send read the rows themselves (signup_ip_limits()), so a save applies to the next
// request without any cache.

const limitsSchema = z.object({
  signup_hourly: z.number().int(),
  signup_daily: z.number().int(),
  signup_hourly_partner: z.number().int(),
  signup_daily_partner: z.number().int(),
  sms_daily: z.number().int(),
  sms_daily_partner: z.number().int(),
})

export async function loadSignupLimits(db: Pick<SupabaseClient, 'rpc'>): Promise<SignupLimits> {
  const { data, error } = await db.rpc('signup_ip_limits')
  if (error) throw new AppError('INTERNAL', 'signup_ip_limits failed', { cause: new Error(error.message) })
  const row = limitsSchema.parse(data)
  return {
    signupHourly: row.signup_hourly,
    signupDaily: row.signup_daily,
    signupHourlyPartner: row.signup_hourly_partner,
    signupDailyPartner: row.signup_daily_partner,
    smsDaily: row.sms_daily,
    smsDailyPartner: row.sms_daily_partner,
  }
}

const limit = z.number().int().min(IP_LIMIT_MIN).max(IP_LIMIT_MAX)
export const signupLimitsSchema = z.object({
  signupHourly: limit,
  signupDaily: limit,
  signupHourlyPartner: limit,
  signupDailyPartner: limit,
  smsDaily: limit,
  smsDailyPartner: limit,
})

const KEYS = [
  ['signupHourly', 'signup_request_ip_hourly'],
  ['signupDaily', 'signup_request_ip_daily'],
  ['signupHourlyPartner', 'signup_request_ip_hourly_partner'],
  ['signupDailyPartner', 'signup_request_ip_daily_partner'],
  ['smsDaily', 'sms_ip_daily'],
  ['smsDailyPartner', 'sms_ip_daily_partner'],
] as const

// One row per limit; the database checks the admin (unbanned), the key and the range again.
export async function saveSignupLimits(deps: SystemSettingDeps, adminId: string, input: unknown): Promise<void> {
  const parsed = signupLimitsSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', SIGNUP_LIMITS_COPY.invalid)
  const limits = parsed.data
  for (const [field, key] of KEYS) {
    await callRpc(deps.db, 'admin_set_system_setting', { p_key: key, p_value: limits[field], p_actor: adminId }, z.unknown())
  }
  deps.invalidate()
  logger.info('admin.system_settings.saved', { adminId, key: 'signup_ip_limits', ...limits })
}
