import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { SIGNUP_GIFT_COPY } from '../features-editor/signup-gift-copy'
import { loadSettingSwitch, type SystemSettingDeps } from './commands'
import type { SignupGiftState } from './types'

// The signup gift's daily cap and pause (1350, ARCHITECTURE §7) on /admin/features. grant_credits
// reads both rows itself, so a save applies to the next sign-up without any cache.

const todaySchema = z.object({ granted: z.number().int(), cap: z.number().int(), paused: z.boolean() })

export async function loadSignupGift(db: SupabaseClient): Promise<SignupGiftState> {
  const [today, paused] = await Promise.all([db.rpc('signup_gift_today'), loadSettingSwitch(db, 'signup_gift_paused')])
  if (today.error) throw new AppError('INTERNAL', 'signup_gift_today failed', { cause: new Error(today.error.message) })
  const { granted, cap } = todaySchema.parse(today.data)
  return { granted, cap, paused }
}

export const signupGiftCapSchema = z.object({ cap: z.number().int().min(0).max(100_000) })

export async function saveSignupGiftCap(deps: SystemSettingDeps, adminId: string, input: unknown): Promise<void> {
  const parsed = signupGiftCapSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', SIGNUP_GIFT_COPY.cap.invalid)
  await callRpc(deps.db, 'admin_set_system_setting', { p_key: 'signup_gift_daily_cap', p_value: parsed.data.cap, p_actor: adminId }, z.unknown())
  deps.invalidate()
  logger.info('admin.system_settings.saved', { adminId, key: 'signup_gift_daily_cap', cap: parsed.data.cap })
}
