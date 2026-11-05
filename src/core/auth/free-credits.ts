import { grantCredits, signupGrantKey, type CreditPool, type RpcClient } from '../billing'
import { logger } from '../logger'

export type GrantCreditsInput = {
  userId: string
  amount: number
  reason: string
  idempotencyKey: string
  pool: CreditPool
}

// Injected so unit tests can assert the call without a database; production uses
// billingGrant(), i.e. the grant_credits SQL function via core/billing.
// `applied` is false when the idempotency key had already been used (a replay).
export type GrantCredits = (input: GrantCreditsInput) => Promise<{ applied: boolean }>

export function billingGrant(admin: RpcClient): GrantCredits {
  return (input) => grantCredits(admin, input)
}

// Called on every verified sign-in; the idempotency key makes all but the first a no-op,
// which also retries a grant that failed last time. A failure never blocks the sign-in.
// The bonus goes to the free pool: it only makes free (public, watermarked) works.
// Returns true only for the call that actually granted, i.e. the account's first sign-in.
export async function grantSignupCredits(grant: GrantCredits, userId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return false
  try {
    const change = await grant({ userId, amount, reason: 'signup', idempotencyKey: signupGrantKey(userId), pool: 'free' })
    return change.applied
  } catch (error) {
    logger.error('signup credit grant failed', { userId, error })
    return false
  }
}
