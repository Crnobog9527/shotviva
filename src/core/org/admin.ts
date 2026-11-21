import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

// Platform admin functions for enterprise orgs (ARCHITECTURE §6.5). `actor` is the signed-in
// admin from the server session; the SQL functions check it is an unbanned admin and write the
// audit log. Service role only.

const uuid = z.uuid()
const count = z.number().int()

// Usage lifts: null clears one. The SQL checks each against system_settings.org_limit_caps.
export const orgUsageSchema = z.object({
  concurrency: count.min(1).nullable(),
  per_window: count.min(1).nullable(),
  batch_max: count.min(1).nullable(),
  multi_template_max: count.min(0).nullable(),
  batch_zip: z.boolean(),
  early_features: z.boolean(),
}).partial()

export const orgCreateSchema = orgUsageSchema.extend({
  owner_user_id: uuid,
  name: z.string().trim().min(1).max(120),
  admin_note: z.string().max(2000).optional(),
  affiliate_enabled: z.boolean().optional(),
  affiliate_levels: z.union([z.literal(1), z.literal(2)]).optional(),
})

export const orgUpdateSchema = orgCreateSchema.omit({ owner_user_id: true }).partial().extend({
  status: z.enum(['active', 'suspended']).optional(),
  admin_note: z.string().max(2000).nullable().optional(),
  rotate_invite: z.boolean().optional(),
  expected_updated_at: z.string().optional(),
})

// kind bank_grant: an offline payment received (credits default to the package's; the CNY
// actually received is a reference). admin_adjust: a correction, note required.
export const orgGrantSchema = z.object({
  org_id: uuid,
  request_id: z.string().trim().min(1).max(200),
  kind: z.enum(['bank_grant', 'admin_adjust']).default('bank_grant'),
  package_id: uuid.nullable().optional(),
  credits: count.optional(),
  amount_cny_fen: count.min(0).optional(),
  reference: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
})

// USD price and credits as entered: no exchange-rate maths (Owner 2026-11-21).
export const orgPackageSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(80),
  price_usd_cents: count.min(1),
  credits: count.min(1),
  active: z.boolean().optional(),
  sort: count.min(0).max(1000).optional(),
  expected_updated_at: z.string().optional(),
})

export async function adminCreateOrg(client: RpcClient, actor: string, input: z.input<typeof orgCreateSchema>): Promise<string> {
  return callRpc(client, 'admin_org_create', { p_actor: uuid.parse(actor), p_input: orgCreateSchema.parse(input) }, uuid)
}

// Returns the org's new updated_at, the expected_updated_at of the next save.
export async function adminUpdateOrg(client: RpcClient, actor: string, orgId: string, input: z.input<typeof orgUpdateSchema>): Promise<string> {
  const args = { p_actor: uuid.parse(actor), p_org_id: uuid.parse(orgId), p_input: orgUpdateSchema.parse(input) }
  return callRpc(client, 'admin_org_update', args, z.string())
}

// Hard cap of the enterprise signup bonus; the column check and admin_org_set_signup_bonus (1690)
// refuse anything above it.
export const ORG_SIGNUP_BONUS_MAX = 1000

export async function adminSetOrgSignupBonus(client: RpcClient, actor: string, orgId: string, credits: number, expectedUpdatedAt: string): Promise<string> {
  const args = {
    p_actor: uuid.parse(actor), p_org_id: uuid.parse(orgId),
    p_credits: count.min(0).max(ORG_SIGNUP_BONUS_MAX).parse(credits), p_expected_updated_at: z.string().min(1).parse(expectedUpdatedAt),
  }
  return callRpc(client, 'admin_org_set_signup_bonus', args, z.string())
}

export async function adminGrantOrg(client: RpcClient, actor: string, input: z.input<typeof orgGrantSchema>) {
  const result = z.object({ applied: z.boolean(), pool_credits: count })
  return callRpc(client, 'admin_org_grant', { p_actor: uuid.parse(actor), p_input: orgGrantSchema.parse(input) }, result)
}

export async function adminSaveOrgPackage(client: RpcClient, actor: string, input: z.input<typeof orgPackageSchema>): Promise<string> {
  return callRpc(client, 'admin_org_package_save', { p_actor: uuid.parse(actor), p_input: orgPackageSchema.parse(input) }, uuid)
}

// Adds an existing registered account to the org without its invite link (1800). Same rules as
// joining by the link; `applied` is false when the account was already an active member.
export async function adminAddOrgMember(client: RpcClient, actor: string, orgId: string, userId: string): Promise<{ applied: boolean }> {
  const args = { p_actor: uuid.parse(actor), p_input: { org_id: uuid.parse(orgId), user_id: uuid.parse(userId) } }
  return callRpc(client, 'admin_org_add_member', args, z.object({ applied: z.boolean() }))
}
