import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { bindReferral } from '@/core/affiliate/referral'
import { errorResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import { isInActiveOrg } from '@/core/billing/org-member-guard'
import { normalizeCode } from '@/core/codes'
import { redemptionResponse } from '@/core/codes/api'
import { redeemCode } from '@/core/codes/server'
import { staffNewUserCode } from '@/core/codes/staff-guard'
import { localeOfReferer } from '@/core/i18n'
import { site } from '@/site/site.config'

const input = z.strictObject({
  code: z.string(), replace: z.boolean().default(false), context: z.enum(['account', 'paywall']).default('account'),
})

export async function POST(request: NextRequest) {
  try {
    return await redeem(request)
  } catch (error) {
    return errorResponse(error, 'codes/redeem')
  }
}

async function redeem(request: NextRequest) {
  assertSameOrigin(request)
  const user = await requireApiBuyer()
  const admin = createAdminSupabase()
  // An active member of an active org, the primary admin included, uses no code at all (gift,
  // discount or invite) and binds no partner here: their credits come from the org's allocations
  // (Owner 2026-11-28, 2032; redeem_code refuses it too). A removed member redeems like anyone
  // else; a staff-link sign-up still gets no new-user reward (1940).
  if (await isInActiveOrg(admin, user.id)) return redemptionResponse({ status: 'org_member' })
  const body = input.safeParse(await request.json().catch(() => null))
  const code = body.success ? normalizeCode(body.data.code) : null
  const invite = site.growth.invite
  // Invalid payloads share the account budget without attempting any redemption.
  const spendAttempt = async () => {
    const { data, error } = await admin.rpc('redeem_limited_code', {
      p_user: user.id, p_code: null, p_context: 'account', p_invitee_credits: null,
      p_invite_window_days: invite.windowDays, p_replace: false,
    })
    if (error) throw new Error('Could not record code redemption attempt')
    return z.object({ status: z.enum(['invalid_input', 'rate_limited']) }).parse(data)
  }
  if (!body.success || !code) return redemptionResponse(await spendAttempt())
  const locale = localeOfReferer(request.headers.get('referer')) ?? user.locale ?? 'en'
  const { replace, context } = body.data
  // A staff-link sign-up never gets a new-user reward, even after leaving the org (1940). The
  // refusal spends an attempt of the account's budget like any redemption, so it cannot be used
  // to probe codes past the limit.
  if (await staffNewUserCode(admin, user.id, code)) {
    const spent = await spendAttempt()
    return redemptionResponse(spent.status === 'rate_limited' ? spent : { status: 'new_users_only' })
  }
  // A partner's link (sv_ref) binds before the code. This is the same late binding checkout
  // does; affiliate_bind refuses once the account has paid. Invite codes are refused here: they
  // are for sign-up only (2030); a customer who joined without one is bound by an admin.
  await bindReferral(user.id, request.cookies.get('sv_ref')?.value, 'first_checkout')
  const result = await redeemCode(admin, { userId: user.id, code, context, replace, invite, locale })
  return redemptionResponse(result)
}
