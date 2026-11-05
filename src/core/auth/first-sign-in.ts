import 'server-only'
import { headers } from 'next/headers'

import { track } from '../analytics'
import { billingGrant, grantSignupCredits } from './free-credits'
import { clientIp, recordSignupIp } from './signup-ip'
import { createAdminSupabase } from './supabase-admin'

export type SignInMethod = 'email' | 'google'

// Runs after any verified sign-in (email link, Google, password). Order matters:
// the IP is stored before the grant so an IP rule in grant_credits can see it.
// `signup` (ARCHITECTURE §16.2) rides on the grant: the signup idempotency key makes the
// first verified sign-in the only one that applies it, so the event fires once per account.
export async function onVerifiedSignIn(userId: string, freeCredits: number, method: SignInMethod): Promise<void> {
  const admin = createAdminSupabase()
  await recordSignupIp(admin, userId, clientIp(await headers()))
  const firstSignIn = await grantSignupCredits(billingGrant(admin), userId, freeCredits)
  if (firstSignIn) track('signup', { method }, { distinctId: userId })
}
