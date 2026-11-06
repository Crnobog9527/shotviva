import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { signupGrantKey } from '../billing'
import { AppError } from '../errors'

// Whether this account was refused the signup gift by the same-IP rule in grant_credits
// (ARCHITECTURE §7, migration 0184), for the one-line note on the account page. A refusal
// leaves no ledger row, so "IP recorded, gift on, no signup row" is the refusal. The same
// reading would also cover a grant that failed and has not been retried yet; the next verified
// sign-in retries it and the note goes away. Service-role client: the ledger is private.
// Lookups: profiles primary key and credit_ledger_idempotency_key_key.
export async function signupGiftRefused(admin: SupabaseClient, userId: string, freeCredits: number): Promise<boolean> {
  if (freeCredits <= 0) return false
  const [profile, ledger] = await Promise.all([
    admin.from('profiles').select('signup_ip').eq('id', userId).maybeSingle<{ signup_ip: string | null }>(),
    admin.from('credit_ledger').select('id').eq('idempotency_key', signupGrantKey(userId)).limit(1),
  ])
  if (profile.error || ledger.error) {
    throw new AppError('INTERNAL', 'signup gift status failed', { cause: profile.error ?? ledger.error })
  }
  return Boolean(profile.data?.signup_ip) && ledger.data.length === 0
}
