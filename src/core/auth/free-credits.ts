import { grantCredits, signupGrantKey, type RpcClient } from '../billing'
import { logger } from '../logger'

export type GrantCreditsInput = { userId: string; amount: number; reason: string; idempotencyKey: string }

// Injected so unit tests can assert the call without a database; production uses
// billingGrant(), i.e. T2's grant_credits SQL function via core/billing.
export type GrantCredits = (input: GrantCreditsInput) => Promise<unknown>

export function billingGrant(admin: RpcClient): GrantCredits {
  return (input) => grantCredits(admin, input)
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
