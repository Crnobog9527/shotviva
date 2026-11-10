import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
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
    const result = await redeemCode(admin, { userId: user.id, code, context, replace, invite, locale })
    return redemptionResponse(result)
  } catch (error) {
    return errorResponse(error, 'codes/redeem')
  }
}
