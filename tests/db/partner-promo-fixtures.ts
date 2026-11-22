import type { Client } from 'pg'
import { expect } from 'vitest'

import { row, sale } from './affiliate-fixtures'
import { createUser } from './helpers'

// Channel partner promotion grants (ARCHITECTURE §6.5 渠道商推广积分, migrations 1840–1843). Accounts,
// bindings and commission confirmation are set up with raw SQL; everything under test goes through
// the real functions. Each test runs in a transaction that is rolled back, so now() is fixed.

export async function adminActor(db: Client) {
  await db.query('update affiliate_settings set enabled=true')
  const actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
  return actor
}

// The grant month the current run is for, the month before (whose confirmations it counts) and
// the one before that.
export async function months(db: Client) {
  return row(db, `select to_char(now() at time zone 'UTC','YYYY-MM') as current,
    to_char((now() at time zone 'UTC') - interval '1 month','YYYY-MM') as previous,
    (date_trunc('month', now() at time zone 'UTC') - interval '10 days') at time zone 'UTC' as in_previous,
    (date_trunc('month', now() at time zone 'UTC') - interval '1 month' - interval '10 days') at time zone 'UTC' as in_before`) as
    Promise<{ current: string; previous: string; in_previous: Date; in_before: Date }>
}

// An org with its affiliate switch on and marked as a channel partner, and its owner (whose
// personal account is also the org's affiliate account).
export async function partner(db: Client, actor: string, mark = true) {
  const owner = await createUser(db)
  const input = { owner_user_id: owner, name: 'Partner ' + owner.slice(0, 8), affiliate_enabled: true }
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, input])).id as string
  if (mark) await db.query('select admin_partner_promo_set($1,$2)', [actor, { org_id: orgId, on: true }])
  return { orgId, owner }
}

// A customer bound to `account` (the org account) at `source` (org_l1 by default).
export async function customer(db: Client, account: string, source = 'org_l1') {
  const id = await createUser(db)
  await db.query("update profiles set referred_by=$2,referred_source=$3,referred_at=now()-interval '90 days' where id=$1", [id, account, source])
  return id
}

// A personal purchase granting `credits` (the purchase ledger row is set to that amount, which is
// what _payment_granted_credits reads), its level-1 commission confirmed at `at`.
export async function confirmedSale(db: Client, buyer: string, credits: number, at: Date) {
  const { id, charge } = await sale(db, buyer, 'pack_m', 2490)
  await db.query(`update credit_ledger l set delta=$2 from payments p
    where p.id=$1 and l.idempotency_key='purchase:'||p.stripe_session_id and l.kind='purchase'`, [id, credits])
  const { rowCount } = await db.query("update affiliate_commissions set status='confirmed',confirmed_at=$2,confirm_after=$2 where payment_id=$1 and level=1", [id, at])
  expect(rowCount).toBe(1)
  return { id: String(id), charge }
}

export type Sheet = {
  id: string; status: string; recipient_user_id: string; base: number; bonus: number; raw_credits: number
  counted_credits: number; customer_cap: number; customers: number; capped_customers: number
  clawback_owed: number; clawback_applied: number; total: number; fingerprint: string
  detail: { per: { customer: string; raw: number; counted: number; capped: boolean }[]; sources: { grant_id: number; owed: number; applied: number }[] }
}

export async function sheet(db: Client, orgId: string, period: string): Promise<Sheet> {
  return row(db, `select id::text,status,recipient_user_id,base,bonus,raw_credits::int,counted_credits::int,customer_cap::int,customers,
    capped_customers,clawback_owed,clawback_applied,total,fingerprint,detail from partner_promo_grants where org_id=$1 and period=$2`, [orgId, period])
}

export const run = async (db: Client, period: string) => (await row(db, 'select partner_promo_run($1) as r', [period])).r
export const decide = async (db: Client, actor: string, input: object) =>
  (await row(db, 'select admin_partner_promo_decide($1,$2) as r', [actor, input])).r as { applied: boolean; reason?: string; total?: number }
export const confirm = (db: Client, actor: string, s: Sheet) => decide(db, actor, { grant_id: s.id, decision: 'confirm', fingerprint: s.fingerprint })

export async function freeOf(db: Client, user: string): Promise<number> {
  return (await row(db, 'select free_credits from profiles where id=$1', [user])).free_credits
}

export async function refused(db: Client, run: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(run()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

// Five equal customers of `each` credits confirmed at `at`: each exactly the 20% cap, so the
// counted total is the raw total.
export async function fiveCustomers(db: Client, account: string, each: number, at: Date) {
  const sales = []
  for (let i = 0; i < 5; i++) sales.push(await confirmedSale(db, await customer(db, account), each, at))
  return sales
}

// The org's promotion pool (where grants land since migration 1894).
export async function promoPoolOf(db: Client, orgId: string): Promise<number> {
  return Number((await row(db, 'select promo_pool_credits from orgs where id=$1', [orgId])).promo_pool_credits)
}

// Turns a grant or top-up made now (into the org pool) into one made before migration 1894: its
// credits leave the org pool and land in the owner's own free pool, as the old confirm and top-up
// did. Used to keep testing the month-end expiry of such rows, which still exist on production.
export async function asLegacy(db: Client, table: 'partner_promo_grants' | 'partner_promo_topups', id: string | number) {
  const amount = table === 'partner_promo_grants' ? 'total' : 'credits'
  const r = await row(db, `update ${table} set destination='owner' where id=$1 returning org_id, recipient_user_id, ${amount} as amt`, [id])
  if (r.amt === 0) return
  await db.query(`update orgs set promo_pool_credits=promo_pool_credits-$2,
    promo_expires_at=case when promo_pool_credits-$2=0 then null else promo_expires_at end where id=$1`, [r.org_id, r.amt])
  const kind = table === 'partner_promo_grants' ? 'partner_promo' : 'partner_promo_topup'
  await db.query("select _apply_credit_change($1,'free',$2,$3,'legacy',$4)", [r.recipient_user_id, kind, r.amt, `${kind}:${id}`])
}
