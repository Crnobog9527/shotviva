import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { signupGrantKey } from '../billing'
import { AppError } from '../errors'

// Whether this account was refused the signup gift, and why, for the one-line note on the
// account page (ARCHITECTURE §7). Since 1350 grant_credits stores the reason on the profile
// ('same_ip', 'daily_cap', 'paused'). Older same-IP refusals (0184) left nothing behind, so
// "IP recorded, gift on, no signup row" still reads as one. The same
// reading would also cover a grant that failed and has not been retried yet; the next verified
// sign-in retries it and the note goes away. Service-role client: the ledger is private.
// Lookups: profiles primary key and credit_ledger_idempotency_key_key.
export type SignupGiftRefusal = 'same_ip' | 'daily_cap' | 'paused'
const REFUSALS: readonly string[] = ['same_ip', 'daily_cap', 'paused'] satisfies SignupGiftRefusal[]

type GiftProfile = { signup_ip: string | null; signup_gift_refusal: string | null }

// No signup row: the stored reason, else a recorded IP means the pre-1350 same-IP refusal.
function refusalOf(profile: GiftProfile | null): SignupGiftRefusal | null {
  const stored = profile?.signup_gift_refusal
  if (stored && REFUSALS.includes(stored)) return stored as SignupGiftRefusal
  return profile?.signup_ip ? 'same_ip' : null
}

export async function readSignupGift(admin: SupabaseClient, userId: string, freeCredits: number) {
  if (freeCredits <= 0) return { granted: 0, refused: false, reason: null }
  const [profile, ledger] = await Promise.all([
    admin.from('profiles').select('signup_ip, signup_gift_refusal').eq('id', userId).maybeSingle<GiftProfile>(),
    admin.from('credit_ledger').select('delta').eq('idempotency_key', signupGrantKey(userId)).limit(1),
  ])
  if (profile.error || ledger.error) {
    throw new AppError('INTERNAL', 'signup gift status failed', { cause: profile.error ?? ledger.error })
  }
  const reason = ledger.data.length > 0 ? null : refusalOf(profile.data)
  return { granted: Number(ledger.data[0]?.delta ?? 0), refused: reason !== null, reason }
}


// Existing callers that only need the refusal flag.
export async function signupGiftRefused(admin: SupabaseClient, userId: string, freeCredits: number) {
  return (await readSignupGift(admin, userId, freeCredits)).refused
}
