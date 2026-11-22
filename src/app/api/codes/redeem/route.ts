import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { bindReferral } from '@/core/affiliate/referral'
import { errorResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import { assertNotOrgMember } from '@/core/billing/org-member-guard'
import { normalizeCode } from '@/core/codes'
import { redemptionResponse } from '@/core/codes/api'
import { redeemCode } from '@/core/codes/server'
import { localeOfReferer } from '@/core/i18n'
import { site } from '@/site/site.config'

const input = z.strictObject({
  code: z.string(), replace: z.boolean().default(false), context: z.enum(['account', 'paywall']).default('account'),
})

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiBuyer()
    const admin = createAdminSupabase()
    // An active org staff member takes no personal gift, discount or invite reward and binds no
    // partner here: the org funds its work (Owner 2026-11-22). The org owner, who still buys, and
    // a removed member redeem like anyone else; a staff-link sign-up still gets no invite reward, as redeem_code needs the
    // signup gift it never got (blocked_no_signup_grant).
    await assertNotOrgMember(admin, user.id)
    const body = input.safeParse(await request.json().catch(() => null))
    const code = body.success ? normalizeCode(body.data.code) : null
    const invite = site.growth.invite
    if (!body.success || !code) {
      // Invalid payloads share the account budget without attempting any redemption.
      const { data, error } = await admin.rpc('redeem_limited_code', {
        p_user: user.id, p_code: null, p_context: 'account', p_invitee_credits: null,
        p_invite_window_days: invite.windowDays, p_replace: false,
      })
      if (error) throw new Error('Could not record code redemption attempt')
      return redemptionResponse(z.object({ status: z.enum(['invalid_input', 'rate_limited']) }).parse(data))
    }
    const locale = localeOfReferer(request.headers.get('referer')) ?? user.locale ?? 'en'
    const { replace, context } = body.data
    // A partner's link (sv_ref) binds before the code: an org member's invite code may bind the
    // customer to the org only when nobody else already has (ARCHITECTURE §6.5). This is the same
    // late binding checkout does; affiliate_bind refuses once the account has paid.
    await bindReferral(user.id, request.cookies.get('sv_ref')?.value, 'first_checkout')
    const result = await redeemCode(admin, { userId: user.id, code, context, replace, invite, locale })
    return redemptionResponse(result)
  } catch (error) {
    return errorResponse(error, 'codes/redeem')
  }
}
