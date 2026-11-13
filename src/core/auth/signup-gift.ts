import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { signupGrantKey } from '../billing'
import { AppError } from '../errors'

// Whether this account was refused the signup gift, and why, for the note on the account page
// (ARCHITECTURE §7). grant_credits stores the reason on the profile: 'same_ip_pending' (over the
// per-network allowance; the account can still claim with a phone or Google, 1410),
// 'daily_cap' and 'paused' (final). Older same-IP refusals are pending too, as claim_signup_gift
// reads them: 'same_ip' (1350) and, before that (0184), no reason but a recorded IP. The same
// reading would also cover a grant that failed and has not been retried yet; the next verified
// sign-in retries it and the note goes away. Service-role client: the ledger is private.
// Lookups: profiles primary key and credit_ledger_idempotency_key_key.
export type SignupGiftRefusal = 'same_ip_pending' | 'daily_cap' | 'paused'

type GiftProfile = { signup_ip: string | null; signup_gift_refusal: string | null }

function refusalOf(profile: GiftProfile | null): SignupGiftRefusal | null {
  const stored = profile?.signup_gift_refusal
  if (stored === 'daily_cap' || stored === 'paused') return stored
  if (stored === 'same_ip_pending' || stored === 'same_ip') return 'same_ip_pending'
  return profile?.signup_ip ? 'same_ip_pending' : null
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
