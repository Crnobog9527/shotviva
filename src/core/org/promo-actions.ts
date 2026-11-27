import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

// The org's promotion pool (ARCHITECTURE §6.5 企业推广积分池, migrations 1890–1893): the channel
// partner grants land here, the owner hands them to members' free pools, and they expire at the
// end of the UTC month. As in ./actions, `owner` / `caller` is the signed-in account from the
// server session and requestId is the idempotency key.

const uuid = z.uuid()
// System keys (monthly top-ups, returns, promotion top-ups and expiries, partner grants) are reserved; the SQL refuses them too.
const requestId = z.string().trim().min(1).max(200).refine((id) => !/^(org_(topup|return|promo_)|partner_promo)/.test(id))
const amount = z.number().int().positive().max(1_000_000_000)
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const promoMoved = z.object({ applied: z.boolean(), promo_pool_credits: z.number().int(), held_promo_credits: z.number().int().optional() })

export type PromoMove = z.infer<typeof promoMoved>

// A one-off grant of promotion credits from the promo pool to a member's free pool.
export async function allocateOrgPromoCredits(client: RpcClient, owner: string, member: string, credits: number, id: string): Promise<PromoMove> {
  const args = { p_owner: uuid.parse(owner), p_member: uuid.parse(member), p_amount: amount.parse(credits), p_request_id: requestId.parse(id) }
  return callRpc(client, 'org_allocate_promo', args, promoMoved)
}

// A member's monthly promotion allowance; what this month still lacks is given at once.
export async function setOrgPromoAllowance(client: RpcClient, owner: string, member: string, allowance: number): Promise<number> {
  const args = { p_owner: uuid.parse(owner), p_member: uuid.parse(member), p_allowance: z.number().int().min(0).max(1_000_000_000).parse(allowance) }
  return callRpc(client, 'org_set_promo_allowance', args, z.number().int())
}

const num = z.coerce.number()
const poolMonth = z.object({
  period,
  // clawed_back / restored (2033): refunds and disputes of purchases that went to the pool.
  paid: z.object({ balance: num, in: num, allocated: num, reclaimed: num, adjusted: num, clawed_back: num.default(0), restored: num.default(0) }),
  promo: z.object({ balance: num, expires_at: z.string().nullable(), granted: num, allocated: num, reclaimed: num, expired: num, held: num }),
})

export type PoolMonth = z.infer<typeof poolMonth>

// The owner's monthly view of both pools (in, out to members, back, expired).
export async function readPoolMonth(client: RpcClient, owner: string, month: string): Promise<PoolMonth> {
  return callRpc(client, 'org_pool_month', { p_owner: uuid.parse(owner), p_period: period.parse(month) }, poolMonth)
}

const promoStats = z.array(z.object({
  member_user_id: uuid, promo_allowance: z.number().int(), held_promo: z.number().int(),
  promo_allocated: num, promo_used: num,
}))

export type MemberPromoStats = { userId: string; allowance: number; held: number; allocated: number; used: number }

// Promotion credits per member for a month: the owner gets every member, a member only themself.
export async function readMemberPromoStats(client: RpcClient, caller: string, orgId: string, month: string): Promise<MemberPromoStats[]> {
  const rows = await callRpc(client, 'org_member_promo_stats', { p_caller: uuid.parse(caller), p_org_id: uuid.parse(orgId), p_period: period.parse(month) }, promoStats)
  return rows.map((r) => ({ userId: r.member_user_id, allowance: r.promo_allowance, held: r.held_promo, allocated: r.promo_allocated, used: r.promo_used }))
}
