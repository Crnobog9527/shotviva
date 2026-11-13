import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { logger } from '../logger'

// Claiming a signup gift the per-network allowance left pending (1480, ARCHITECTURE §7): the
// account proves a verified phone number or a linked Google account, each of which pays one
// signup gift ever. claim_signup_gift reads the phone and the Google identity from Supabase Auth
// itself, so nothing the browser sends decides who is paid.

export type ClaimMethod = 'phone' | 'google'

export const CLAIM_STATUSES = ['granted', 'not_pending', 'method_off', 'no_identity', 'already_used', 'paused', 'daily_cap'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

const statusSchema = z.enum(CLAIM_STATUSES)

export async function claimSignupGift(admin: SupabaseClient, userId: string, method: ClaimMethod | null): Promise<ClaimStatus> {
  const { data, error } = await admin.rpc('claim_signup_gift', { p_user_id: userId, p_method: method })
  if (error) throw new AppError('INTERNAL', 'claim_signup_gift failed', { cause: new Error(error.message) })
  return statusSchema.parse(data)
}

// After a verified sign-in: a phone or Google sign-up over the allowance is paid straight away,
// and a Google account just linked from the account page lands here too. Never blocks a sign-in.
export async function claimQuietly(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    return (await claimSignupGift(admin, userId, null)) === 'granted'
  } catch (error) {
    logger.error('signup gift claim failed', { userId, error })
    return false
  }
}

// Which claim methods the admin left on (signup_gift_claim_phone / _google, default on).
// The allowance per network rides along, for the account page's explanation.
const optionsSchema = z.object({ claim_phone: z.boolean(), claim_google: z.boolean(), per_ip: z.number().int() })

export type ClaimOptions = { phone: boolean; google: boolean; perIp: number }

export async function readClaimOptions(admin: SupabaseClient): Promise<ClaimOptions> {
  const { data, error } = await admin.rpc('signup_gift_today')
  if (error) throw new AppError('INTERNAL', 'signup_gift_today failed', { cause: new Error(error.message) })
  const parsed = optionsSchema.parse(data)
  return { phone: parsed.claim_phone, google: parsed.claim_google, perIp: parsed.per_ip }
}
