import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { track } from '../analytics'
import type { Locale } from '../i18n/locales'
import type { InviteConfig } from './index'

const result = z.object({
  status: z.enum(['ok','not_found','expired','banned','own','used','full','new_users_only','already_invited',
    'blocked_same_ip','blocked_no_signup_grant','needs_confirm','checkout_in_progress','invalid_input','rate_limited']),
  kind: z.enum(['invite','campaign']).optional(),
  credits_granted: z.number().int().nonnegative().optional(), pool: z.enum(['free','paid']).nullish(),
  discount_percent: z.number().nullish(), current_code: z.string().optional(),
  discount_products: z.array(z.string()).nullish(), discount_expires_at: z.string().nullish(), replaced: z.boolean().optional(),
})
type Claim = { userId: string; code: string; context: 'signup'|'account'|'paywall'; replace?: boolean; invite: InviteConfig; locale: Locale }

export async function redeemCode(admin: SupabaseClient, input: Claim) {
  const { data, error } = await admin.rpc(input.context === 'signup' ? 'redeem_code' : 'redeem_limited_code', {
    p_user: input.userId, p_code: input.code, p_context: input.context, p_replace: input.replace ?? false,
    p_invitee_credits: input.invite.inviteeCredits, p_invite_window_days: input.invite.windowDays,
  })
  if (error) throw error
  const r = result.parse(data)
  return describeResult(input, r)
}

function describeResult(input: Claim, r: z.infer<typeof result>) {
  const credits = r.credits_granted ?? 0
  const pool = r.pool ?? null
  const percent = r.discount_percent ?? null
  track('code_redeem', { kind: r.kind ?? null, ...(r.kind === 'campaign' && { code: input.code }),
    context: input.context, status: r.status, credits, pool, discount_percent: percent }, { distinctId: input.userId, locale: input.locale })
  return {
    kind: r.kind ?? null, status: r.status, credits, pool, percent, currentCode: r.current_code,
    products: r.discount_products ?? [], expiresAt: r.discount_expires_at ?? null, replaced: r.replaced ?? false,
  }
}
