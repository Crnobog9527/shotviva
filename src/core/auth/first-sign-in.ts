import 'server-only'
import { headers } from 'next/headers'

import { grantSignupCredits, supabaseGrantCredits } from './free-credits'
import { clientIp, recordSignupIp } from './signup-ip'
import { createAdminSupabase } from './supabase-admin'

// Runs after any verified sign-in (email link, Google, password). Order matters:
// the IP is stored before the grant so an IP rule in grant_credits can see it.
export async function onVerifiedSignIn(userId: string, freeCredits: number): Promise<void> {
  const admin = createAdminSupabase()
  await recordSignupIp(admin, userId, clientIp(await headers()))
  await grantSignupCredits(supabaseGrantCredits(admin), userId, freeCredits)
}
