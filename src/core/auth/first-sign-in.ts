import 'server-only'
import { headers } from 'next/headers'

import { track } from '../analytics'
import { billingGrant, grantSignupCredits } from './free-credits'
import { clientIp, recordSignupIp } from './signup-ip'
import { createAdminSupabase } from './supabase-admin'

export type SignInMethod = 'email' | 'google'

// Runs after any verified sign-in (email link, Google, password). Order matters: the IP is
// stored before the grant so the same-IP rule in grant_credits (0184) can see it.
// `signup` (ARCHITECTURE §16.2) fires once per account. With an IP (always, behind Vercel) the
// first sign-in is the one that stored it: the grant can no longer tell, since an account the
// same-IP rule refuses never has a grant applied. Without one (local dev) it falls back to the
// grant, whose signup idempotency key applies only once.
export async function onVerifiedSignIn(userId: string, freeCredits: number, method: SignInMethod): Promise<void> {
  const admin = createAdminSupabase()
  const address = clientIp(await headers())
  const ipStored = await recordSignupIp(admin, userId, address)
  const granted = await grantSignupCredits(billingGrant(admin), userId, freeCredits)
  if (address ? ipStored : granted) track('signup', { method }, { distinctId: userId })
}
