import 'server-only'
import { cookies, headers } from 'next/headers'

import { bindReferral } from '../affiliate/referral'
import { noteSignupGift } from '../alerts'
import { track } from '../analytics'
import { parseShareMark, SHARE_COOKIE } from '../analytics/share-link'
import { signupExperiments, syncExperimentsAtSignIn } from '../experiments/server'
import type { Locale } from '../i18n/locales'
import { billingGrant, grantSignupCredits } from './free-credits'
import { consumeSignupCode, type SignupBenefits } from './signup-code'
import { claimQuietly } from './signup-gift-claim'
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
// A template share link opened before signing up (core/analytics/share-link.ts), and the A/B
// variants this browser saw first (ARCHITECTURE §16.5).
function signupMarks(shareCookie: string | undefined, experiments: Parameters<typeof signupExperiments>[0]) {
  const share = parseShareMark(shareCookie)
  const seen = signupExperiments(experiments)
  return { ...(share ? { share_template_id: share.templateId, share_id: share.shareId } : {}), ...(seen ? { experiments: seen } : {}) }
}

// Local dev runs on http; everywhere else the cookie is Secure.
const isSecure = (head: Headers) => head.get('x-forwarded-proto') !== 'http'

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
  // 1480: an account over the per-network allowance is pending; a confirmed phone or a linked
  // Google account pays it now (a phone or Google sign-up, or a Google account just linked).
  const claimed = !granted && benefits.freeCredits > 0 && (await claimQuietly(admin, userId))
  const first = address ? ipStored : granted
  if (claimed && !first) noteSignupGift()
  const kind = await consumeSignupCode(admin, userId, first, benefits.invite, locale)
  const jar = await cookies()
  // A/B variants onto the account, and the account's back into the cookie (ARCHITECTURE §16.5).
  const experiments = await syncExperimentsAtSignIn(admin, userId, first, jar, isSecure(await headers()))
  if (first) {
    // 1350: tell the Owner when half, then all, of today's signup gifts are gone (after()).
    noteSignupGift()
    track('signup', { method, code_kind: kind, ...signupMarks(jar.get(SHARE_COOKIE)?.value, experiments) }, { distinctId: userId, locale })
    await bindReferral(userId, jar.get('sv_ref')?.value, 'signup')
  }
}
