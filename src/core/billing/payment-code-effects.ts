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

const applied = z.object({ applied: z.boolean(), rewarded: z.boolean(), conflict: z.boolean() })
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
      p_inviter_credits: invite.inviterCredits, p_inviter_cap: invite.inviterRewardCap,
    }, applied)
    if (result.applied && result.conflict) logger.warn('billing.code_discount_conflict', { payment_id: id, code_id: payment.codeId })
    if (!result.rewarded) return
    // Analytics is best effort. The RPC has already committed the reward even when
    // the inviter deletes their account before this lookup.
    const reward = await admin.from('code_redemptions').select('inviter_user_id')
      .eq('user_id', payment.userId).eq('kind', 'invite').eq('inviter_reward_payment_id', id).single()
    if (!reward.data?.inviter_user_id) {
      logger.warn('billing.invite_reward_analytics_missing', { payment_id: id })
      return
    }
    trackReward(reward.data.inviter_user_id, { credits: invite.inviterCredits, product_id: payment.productId }, payment.locale)
  }
}
