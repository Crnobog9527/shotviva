import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'

import { applyPurchase, type RpcClient } from '@/core/billing'
import { adminCreateOrg, adminGrantOrg, joinOrg } from '@/core/org'

import { createUser, type TestProfile } from './helpers'

// Enterprise org fixtures (ARCHITECTURE §6.5). Everything goes through the real functions over
// PostgREST, the way the app calls them; raw SQL only sets up accounts and reads results.

export type Plan = 'starter_monthly' | 'pro_monthly' | 'max_monthly'

export async function account(db: Client, service: RpcClient, opts: TestProfile & { plan?: Plan; admin?: boolean } = {}) {
  const userId = await createUser(db, opts)
  if (opts.plan) await applyPurchase(service, { userId, productId: opts.plan, eventId: `cs_${randomUUID()}` })
  if (opts.admin) await db.query("update public.profiles set role = 'admin' where id = $1", [userId])
  return userId
}

export const adminAccount = (db: Client, service: RpcClient) => account(db, service, { admin: true })

// A new org owned by a fresh account, with `pool` credits granted as an offline payment.
export async function orgWith(db: Client, service: RpcClient, actor: string, opts: { pool?: number; usage?: Record<string, unknown> } = {}) {
  const owner = await account(db, service)
  const orgId = await adminCreateOrg(service, actor, { owner_user_id: owner, name: `Org ${owner.slice(0, 8)}`, ...opts.usage })
  if (opts.pool) await adminGrantOrg(service, actor, { org_id: orgId, request_id: `grant:${randomUUID()}`, credits: opts.pool })
  return { orgId, owner, token: await inviteToken(db, orgId) }
}

export async function inviteToken(db: Client, orgId: string): Promise<string> {
  const { rows } = await db.query<{ invite_token: string }>('select invite_token from public.orgs where id = $1', [orgId])
  return rows[0]!.invite_token
}

export async function member(db: Client, service: RpcClient, token: string, opts: TestProfile & { plan?: Plan } = {}) {
  const userId = await account(db, service, opts)
  await joinOrg(service, userId, token)
  return userId
}

export async function poolOf(db: Client, orgId: string): Promise<number> {
  const { rows } = await db.query<{ pool_credits: string }>('select pool_credits from public.orgs where id = $1', [orgId])
  return Number(rows[0]!.pool_credits)
}

export async function memberRow(db: Client, orgId: string, userId: string) {
  const { rows } = await db.query<{ held_credits: number; status: string; monthly_allowance: number }>(
    'select held_credits, status, monthly_allowance from public.org_members where org_id = $1 and user_id = $2',
    [orgId, userId],
  )
  return rows[0]
}

export async function creditsOf(db: Client, userId: string): Promise<number> {
  const { rows } = await db.query<{ credits: number }>('select credits from public.profiles where id = $1', [userId])
  return rows[0]!.credits
}

export async function orgLedger(db: Client, orgId: string) {
  const { rows } = await db.query<{ kind: string; delta: string; pool_after: string; request_id: string }>(
    'select kind, delta, pool_after, request_id from public.org_credit_ledger where org_id = $1 order by id',
    [orgId],
  )
  return rows.map((row) => ({ ...row, delta: Number(row.delta), pool_after: Number(row.pool_after) }))
}
