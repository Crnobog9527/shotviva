import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { trackInviteReward } from '../analytics/funnel'
import type { InviteConfig } from '../codes'
import type { ProductId } from '../config'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { callRpc } from './rpc'

type Payment = {
  channel: 'stripe' | 'waffo'
  reference: string
  userId: string
  productId: ProductId
  locale: Locale
  codeId: string | null
  amountDiscount: number
}

const outcome = z.object({ applied: z.boolean(), conflict: z.boolean() })
const applied = z.discriminatedUnion('rewarded', [
  outcome.extend({ rewarded: z.literal(false) }),
  outcome.extend({ rewarded: z.literal(true), inviter_id: z.uuid(), reward_credits: z.int().positive() }),
])
export type ApplyPaymentCodes = (payment: Payment) => Promise<void>

// Both settlement RPCs predate T94. Their provider references uniquely identify the
// committed payments row on the first delivery and on a retry after settlement.
export function paymentCodeEffects(admin: SupabaseClient, invite: InviteConfig, trackReward = trackInviteReward): ApplyPaymentCodes {
  return async payment => {
    const key = payment.channel === 'stripe' ? 'stripe_session_id' : 'waffo_payment_id'
    const { data, error } = await admin.from('payments').select('id')
      .eq('channel', payment.channel).eq('user_id', payment.userId).eq(key, payment.reference).single()
    if (error) throw error
    const { id } = z.object({ id: z.number().int().positive() }).parse(data)
    const result = await callRpc(admin, 'apply_payment_code_effects', {
      p_user: payment.userId, p_payment_id: id, p_code_id: payment.codeId, p_amount_discount: payment.amountDiscount,
      // The SQL compatibility argument is ignored. Reward amounts come from the database.
      p_inviter_credits: null, p_inviter_cap: invite.inviterRewardCap,
    }, applied)
    if (result.applied && result.conflict) logger.warn('billing.code_discount_conflict', { payment_id: id, code_id: payment.codeId })
    if (!result.rewarded) return
    trackReward(result.inviter_id, { credits: result.reward_credits, product_id: payment.productId }, payment.locale)
  }
}
