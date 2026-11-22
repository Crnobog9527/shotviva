import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

// Org default allowances and bulk actions (ARCHITECTURE §6.5 「默认额度与批量」, migration 1899).
// `owner` is the signed-in account from the server session; requestId is the idempotency key of
// the whole action (a repeat does nothing).

const uuid = z.uuid()
const requestId = z.string().trim().min(1).max(150).refine((id) => !/^(org_(topup|return|promo_)|partner_promo)/.test(id))
const allowance = z.number().int().min(0).max(1_000_000_000)
// A new allowance of one kind: a number (personal), 'default' (follow the org default), or left out.
const allowanceValue = z.union([allowance, z.literal('default')]).optional()
const members = z.array(uuid).min(1).max(200)

export const bulkSetSchema = z.object({ members, paid: allowanceValue, promo: allowanceValue })
  .refine((v) => v.paid !== undefined || v.promo !== undefined, { message: 'Nothing to set' })
export const bulkGrantSchema = z.object({ members, kind: z.enum(['paid', 'promo']), each: z.number().int().positive().max(1_000_000_000) })
export const defaultsSchema = z.object({ paid: allowance.optional(), promo: allowance.optional() })
  .refine((v) => v.paid !== undefined || v.promo !== undefined, { message: 'Nothing to set' })

const defaults = z.object({ applied: z.boolean(), default_paid_allowance: z.number().int(), default_promo_allowance: z.number().int() })
const bulkSet = z.object({ applied: z.boolean(), members: z.number().int() })
const bulkGrant = z.object({ applied: z.boolean(), members: z.number().int(), total: z.coerce.number(), pool_credits: z.coerce.number() })

export async function setOrgDefaultAllowances(client: RpcClient, owner: string, input: z.input<typeof defaultsSchema>, id: string) {
  return callRpc(client, 'org_set_default_allowances', { p_owner: uuid.parse(owner), p_input: defaultsSchema.parse(input), p_request_id: requestId.parse(id) }, defaults)
}

export async function bulkSetOrgAllowance(client: RpcClient, owner: string, input: z.input<typeof bulkSetSchema>, id: string) {
  return callRpc(client, 'org_bulk_set_allowance', { p_owner: uuid.parse(owner), p_input: bulkSetSchema.parse(input), p_request_id: requestId.parse(id) }, bulkSet)
}

export async function bulkGrantOrgCredits(client: RpcClient, owner: string, input: z.input<typeof bulkGrantSchema>, id: string) {
  return callRpc(client, 'org_bulk_grant', { p_owner: uuid.parse(owner), p_input: bulkGrantSchema.parse(input), p_request_id: requestId.parse(id) }, bulkGrant)
}
