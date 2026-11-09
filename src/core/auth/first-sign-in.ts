import 'server-only'
import { cookies, headers } from 'next/headers'

import { bindReferral } from '../affiliate/referral'
import { track } from '../analytics'
import type { Locale } from '../i18n/locales'
import { billingGrant, grantSignupCredits } from './free-credits'
import { consumeSignupCode, type SignupBenefits } from './signup-code'
import { clientIp, recordSignupIp } from './signup-ip'
import { createAdminSupabase } from './supabase-admin'

export type SignInMethod = 'email' | 'google' | 'phone'

// Runs after any verified sign-in (email link, Google, password). Order matters: the IP is
// stored before the grant so the same-IP rule in grant_credits (0184) can see it.
// `signup` (ARCHITECTURE §16.2) fires once per account. With an IP (always, behind Vercel) the
// first sign-in is the one that stored it: the grant can no longer tell, since an account the
// same-IP rule refuses never has a grant applied. Without one (local dev) it falls back to the
// grant, whose signup idempotency key applies only once.
// `locale` is the language the account signed up in (user_metadata) or else the page's.
export async function onVerifiedSignIn(
  userId: string,
  benefits: SignupBenefits,
  method: SignInMethod,
  locale: Locale,
): Promise<void> {
  const admin = createAdminSupabase()
  const address = clientIp(await headers())
  const ipStored = await recordSignupIp(admin, userId, address)
  const granted = await grantSignupCredits(billingGrant(admin), userId, benefits.freeCredits)
  const first = address ? ipStored : granted
  const kind = await consumeSignupCode(admin, userId, first, benefits.invite, locale)
  if (first) {
    track('signup', { method, code_kind: kind }, { distinctId: userId, locale })
    await bindReferral(userId, (await cookies()).get('sv_ref')?.value, 'signup')
  }
}
