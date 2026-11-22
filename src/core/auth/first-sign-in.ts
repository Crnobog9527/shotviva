import 'server-only'
import { cookies, headers } from 'next/headers'

import { bindReferral } from '../affiliate/referral'
import { noteSignupGift } from '../alerts'
import { track } from '../analytics'
import { COLLECTION_COOKIE, parseCollectionMark } from '../analytics/collection-link'
import { parseShareMark, SHARE_COOKIE } from '../analytics/share-link'
import { FIRST_TOUCH_COOKIE, recordFirstTouchAtSignIn } from '../attribution/sign-in'
import { serverEnv } from '../env'
import { signupExperiments, syncExperimentsAtSignIn } from '../experiments/server'
import type { Locale } from '../i18n/locales'
import { billingGrant, grantSignupCredits } from './free-credits'
import { consumeSignupCode, type SignupBenefits } from './signup-code'
import { claimQuietly } from './signup-gift-claim'
import { clientIp, recordSignupIp } from './signup-ip'
import { isStaffSignup } from './staff-signup'
import { createAdminSupabase } from './supabase-admin'

export type SignInMethod = 'email' | 'google' | 'phone'

// Runs after any verified sign-in (email link, Google, password). Order matters: the IP is
// stored before the grant so the same-IP rule in grant_credits (0184) can see it.
// `signup` (ARCHITECTURE §16.2) fires once per account. With an IP (always, behind Vercel) the
// first sign-in is the one that stored it: the grant can no longer tell, since an account the
// same-IP rule refuses never has a grant applied. Without one (local dev) it falls back to the
// grant, whose signup idempotency key applies only once.
// `locale` is the language the account signed up in (user_metadata) or else the page's.
// A template share link and a template collection link opened before signing up
// (core/analytics/share-link.ts, collection-link.ts), and the A/B variants this browser saw first
// (ARCHITECTURE §16.5).
type Jar = { get(name: string): { value: string } | undefined }
export function signupMarks(jar: Jar, experiments: Parameters<typeof signupExperiments>[0]) {
  const share = parseShareMark(jar.get(SHARE_COOKIE)?.value)
  const collection = parseCollectionMark(jar.get(COLLECTION_COOKIE)?.value)
  const seen = signupExperiments(experiments)
  return {
    ...(share ? { share_template_id: share.templateId, share_id: share.shareId } : {}),
    ...(collection ? { share_collection_id: collection } : {}),
    ...(seen ? { experiments: seen } : {}),
  }
}

// Local dev runs on http; everywhere else the cookie is Secure.
const isSecure = (head: Headers) => head.get('x-forwarded-proto') !== 'http'

// Only a first sign-in (a new account) binds a partner's link.
async function bindSignupReferral(userId: string, first: boolean, cookie: string | undefined) {
  if (first) await bindReferral(userId, cookie, 'signup')
}

export async function onVerifiedSignIn(
  userId: string,
  benefits: SignupBenefits,
  method: SignInMethod,
  locale: Locale,
  next?: string | null,
): Promise<void> {
  const admin = createAdminSupabase()
  const address = clientIp(await headers())
  const ipStored = await recordSignupIp(admin, userId, address)
  // An org's staff link (next = /join/org/<token>) signs up a staff account: no free credits.
  const gift = (await isStaffSignup(admin, next)) ? 0 : benefits.freeCredits
  const granted = await grantSignupCredits(billingGrant(admin), userId, gift)
  // 1480: an account over the per-network allowance is pending; a confirmed phone or a linked
  // Google account pays it now (a phone or Google sign-up, or a Google account just linked).
  const claimed = !granted && gift > 0 && (await claimQuietly(admin, userId))
  const first = address ? ipStored : granted
  if (claimed && !first) noteSignupGift()
  const jar = await cookies()
  // A personal partner's link (sv_ref) binds before the signup code is redeemed: an org member's
  // invite code binds the customer to the org only when nobody else already has (§6.5).
  await bindSignupReferral(userId, first, jar.get('sv_ref')?.value)
  const kind = await consumeSignupCode(admin, userId, first, benefits.invite, locale)
  // A/B variants onto the account, and the account's back into the cookie (ARCHITECTURE §16.5).
  const experiments = await syncExperimentsAtSignIn(admin, userId, first, jar, isSecure(await headers()))
  // Where this browser first landed, onto the account once (ARCHITECTURE §16.6).
  await recordFirstTouchAtSignIn(admin, userId, jar.get(FIRST_TOUCH_COOKIE)?.value, serverEnv().SUPABASE_SERVICE_ROLE_KEY)
  if (first) {
    // 1350: tell the Owner when half, then all, of today's signup gifts are gone (after()).
    noteSignupGift()
    track('signup', { method, code_kind: kind, ...signupMarks(jar, experiments) }, { distinctId: userId, locale })
  }
}
