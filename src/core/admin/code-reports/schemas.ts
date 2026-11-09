import { z } from 'zod'

const timestamp = z.iso.datetime({ offset: true })
export const codeKind = z.enum(['campaign', 'invite'])
const paymentId = z.int().positive()
const count = z.int().nonnegative()
const money = z.object({ net: z.int(), discount: count })
const identity = z.object({ id: z.uuid(), created_at: timestamp })

export const codeRow = identity.extend({
  code: z.string(), kind: codeKind, owner_user_id: z.uuid().nullable(),
  invitee_credits: count.nullable(), invitee_pool: z.enum(['paid', 'free']).nullable(),
  discount_products: z.array(z.string()).nullable(), discount_percent: count.nullable(),
  discount_duration: z.enum(['once', 'repeating', 'forever']).nullable(), discount_months: count.nullable(),
  discount_valid_days: count.nullable(), starts_at: timestamp.nullable(), expires_at: timestamp.nullable(),
  active: z.boolean(), redemption_count: count, max_redemptions: count.nullable(), new_users_only: z.boolean(),
  note: z.string().nullable(), purchasers: count, amounts: z.record(z.string().regex(/^[a-z]{3}$/), money),
})

export const redemptionRow = identity.extend({
  code_id: z.uuid().nullable(), code: z.string().nullable(), user_id: z.uuid(), inviter_user_id: z.uuid().nullable(),
  context: z.enum(['signup', 'account', 'paywall']), status: z.enum(['ok', 'blocked_same_ip', 'blocked_no_signup_grant']),
  credits_granted: count, inviter_reward_payment_id: paymentId.nullable(), inviter_rewarded_at: timestamp.nullable(),
  discount_used_payment_id: paymentId.nullable(), discount_void_at: timestamp.nullable(),
  discount_expires_at: timestamp.nullable(), discount_conflict_payments: z.array(paymentId),
  reward_payment_status: z.enum(['paid', 'refunded', 'partially_refunded', 'disputed']).nullable(), reward_payment_refunded: count.nullable(),
})

export const inviterRow = z.object({ inviter_user_id: z.uuid(), invited: count, purchasers: count, earned: count })
export type CodeRow = z.infer<typeof codeRow>
export type CodeKind = z.infer<typeof codeKind>
export type RedemptionRow = z.infer<typeof redemptionRow>
export type InviterRow = z.infer<typeof inviterRow>
