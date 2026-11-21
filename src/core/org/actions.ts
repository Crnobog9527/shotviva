import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'

// Owner and member actions on an enterprise org (ARCHITECTURE §6.5). Every function is
// service_role only and takes the signed-in account's own id (`owner` / `user`) from the server
// session, never from the request body. requestId is the idempotency key of a pool movement: a
// repeat does nothing, another request under the same id is CONFLICT.

const uuid = z.uuid()
// `org_topup:` ids belong to the monthly top-up; the SQL refuses them too.
const requestId = z.string().trim().min(1).max(200).refine((id) => !id.startsWith('org_topup:'))
const amount = z.number().int().positive().max(1_000_000_000)
const moved = z.object({ applied: z.boolean(), pool_credits: z.number().int(), held_credits: z.number().int().optional() })

export type PoolMove = z.infer<typeof moved>

// Join the org behind an invite link; returns its id. Already in it: the same id again.
export async function joinOrg(client: RpcClient, user: string, token: string): Promise<string> {
  return callRpc(client, 'org_join', { p_user: uuid.parse(user), p_token: z.string().max(64).parse(token) }, uuid)
}

// Leave the org; the org's share of the member's credits goes back to its pool. Returns what
// was taken back (0 when not in an org).
export async function leaveOrg(client: RpcClient, user: string, id: string): Promise<number> {
  return callRpc(client, 'org_leave', { p_user: uuid.parse(user), p_request_id: requestId.parse(id) }, z.number().int())
}

export async function removeOrgMember(client: RpcClient, owner: string, member: string, id: string): Promise<number> {
  const args = { p_owner: uuid.parse(owner), p_member: uuid.parse(member), p_request_id: requestId.parse(id) }
  return callRpc(client, 'org_remove_member', args, z.number().int())
}

export async function allocateOrgCredits(client: RpcClient, owner: string, member: string, credits: number, id: string): Promise<PoolMove> {
  const args = { p_owner: uuid.parse(owner), p_member: uuid.parse(member), p_amount: amount.parse(credits), p_request_id: requestId.parse(id) }
  return callRpc(client, 'org_allocate', args, moved)
}

export async function setOrgAllowance(client: RpcClient, owner: string, member: string, allowance: number): Promise<number> {
  const args = { p_owner: uuid.parse(owner), p_member: uuid.parse(member), p_allowance: z.number().int().min(0).max(1_000_000_000).parse(allowance) }
  return callRpc(client, 'org_set_allowance', args, z.number().int())
}

// The owner puts their own paid credits (not the org-held share) into the pool.
export async function depositOrgCredits(client: RpcClient, owner: string, credits: number, id: string): Promise<PoolMove> {
  const args = { p_owner: uuid.parse(owner), p_amount: amount.parse(credits), p_request_id: requestId.parse(id) }
  return callRpc(client, 'org_deposit', args, moved)
}
