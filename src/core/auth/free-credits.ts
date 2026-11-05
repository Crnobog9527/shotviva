import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'

export type GrantCreditsInput = { userId: string; amount: number; reason: string; idempotencyKey: string }

// Adapter over T2's grant_credits(user_id, amount, reason, idempotency_key) SQL function.
// Kept as an interface so tests (and the period before T2 merges) can inject a fake.
export type GrantCredits = (input: GrantCreditsInput) => Promise<void>

export function supabaseGrantCredits(admin: SupabaseClient): GrantCredits {
  return async ({ userId, amount, reason, idempotencyKey }) => {
    const { error } = await admin.rpc('grant_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    })
    if (error) throw new Error(`grant_credits failed: ${error.code ?? 'unknown'}`)
  }
}

export function signupGrantKey(userId: string): string {
  return `signup:${userId}`
}

// Called on every verified sign-in; the idempotency key makes all but the first a no-op,
// which also retries a grant that failed last time. A failure never blocks the sign-in.
export async function grantSignupCredits(grant: GrantCredits, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return
  try {
    await grant({ userId, amount, reason: 'signup', idempotencyKey: signupGrantKey(userId) })
  } catch (error) {
    logger.error('signup credit grant failed', { userId, error })
  }
}
