import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { promoter, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser, serviceClient, uniqueIp } from './helpers'

// Migration 2025 (ARCHITECTURE §6.4 / §6.5, Owner 2026-11-27):
// 1. An org staff member's invite code skips the same-IP block when it binds the customer to the
//    org (org_l1); personal codes keep it.
// 2. A blocked attempt (blocked_same_ip / blocked_no_signup_grant) no longer counts as 'used' or
//    'already_invited': the user can redeem again once the block no longer applies, and is paid once.
// Fake data only; every test makes its own users, so nothing is rolled back.

let db: Client
let actor: string
beforeAll(async () => {
  db = await connectAdmin()
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterAll(async () => { await db.end() })

async function orgTeam(opts: { bonus?: number; affiliate?: boolean } = {}) {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor,
    { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: opts.affiliate ?? true }])).id as string
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  const staff = await createUser(db)
  await db.query('select org_join($1,$2)', [staff, invite_token])
  if (opts.bonus) {
    const { at } = await row(db, 'select updated_at::text as at from orgs where id=$1', [orgId])
    await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, opts.bonus, at])
  }
  return { owner, orgId, staff }
}

const codeOf = async (user: string) => (await row(db, 'select get_or_create_invite_code($1) as code', [user])).code as string
const giveGift = (user: string) => db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [user, 'signup:' + user])
// The gift first (on its own network), then both accounts on one network, as at a shop counter.
async function customerNextTo(inviter: string, opts: { gift?: boolean } = {}) {
  const customer = await createUser(db)
  if (opts.gift ?? true) await giveGift(customer)
  const ip = uniqueIp()
  await db.query('update profiles set signup_ip=$1 where id in ($2,$3)', [ip, inviter, customer])
  return customer
}
async function redeem(user: string, code: string, context = 'signup') {
  return (await row(db, 'select redeem_code($1,$2,$3,null,$4) as r', [user, code, context, invite.windowDays])).r as
    { status: string; credits_granted?: number }
}
const rowsOf = (user: string) => db.query(
  'select code_id,status,credits_granted,blocked_status,(blocked_at is not null) as had_block from code_redemptions where user_id=$1',
  [user]).then((r) => r.rows)
const codeGrants = (user: string) => db.query(
  "select delta,idempotency_key from credit_ledger where user_id=$1 and kind='code_grant'", [user]).then((r) => r.rows)
const binding = (user: string) => row(db, 'select referred_by,referred_source,referred_member from profiles where id=$1', [user])
const orgAccount = async (orgId: string) => (await row(db, 'select user_id from affiliates where org_id=$1', [orgId])).user_id as string
const bonusLedger = (user: string) =>
  db.query("select delta from credit_ledger where user_id=$1 and kind='org_signup_bonus'", [user]).then((r) => r.rows)

it('lets an org staff code through on a shared network: org_l1 binding and the org bonus, once', async () => {
  const { orgId, staff } = await orgTeam({ bonus: 300 })
  const customer = await customerNextTo(staff)
  const result = await redeem(customer, await codeOf(staff))
  expect(result.status).toBe('ok')
  expect(await binding(customer)).toEqual({ referred_by: await orgAccount(orgId), referred_source: 'org_l1', referred_member: staff })
  expect(await bonusLedger(customer)).toEqual([{ delta: 300 }])
  expect(await codeGrants(customer)).toHaveLength(result.credits_granted ? 1 : 0)
  expect(await redeem(customer, await codeOf(staff), 'account')).toMatchObject({ status: 'used' })
  expect(await bonusLedger(customer)).toHaveLength(1)
})

it('keeps the same-IP block for personal codes and for org codes that would not bind the org', async () => {
  // A personal inviter.
  const person = await createUser(db)
  const a = await customerNextTo(person)
  expect((await redeem(a, await codeOf(person))).status).toBe('blocked_same_ip')

  // The org's affiliate switch is off: the code would not bind anyone to the org.
  const off = await orgTeam({ affiliate: false })
  const b = await customerNextTo(off.staff)
  expect((await redeem(b, await codeOf(off.staff))).status).toBe('blocked_same_ip')

  // The customer is already another partner's: the org would not get them.
  const on = await orgTeam()
  const c = await customerNextTo(on.staff)
  const other = await promoter(db)
  await db.query("update profiles set referred_by=$2,referred_at=now(),referred_source='signup' where id=$1", [c, other.id])
  expect((await redeem(c, await codeOf(on.staff))).status).toBe('blocked_same_ip')

  // A level-1 customer's own personal code (the org_l2 path) is a personal code.
  const l1 = await customerNextTo(on.staff)
  expect((await redeem(l1, await codeOf(on.staff))).status).toBe('ok')
  const l2 = await customerNextTo(l1)
  expect((await redeem(l2, await codeOf(l1))).status).toBe('blocked_same_ip')

  // A colleague is not the org's customer.
  const colleague = await createUser(db)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [on.orgId])
  await db.query('select org_join($1,$2)', [colleague, invite_token])
  await giveGift(colleague)
  await db.query('update profiles set signup_ip=(select signup_ip from profiles where id=$2) where id=$1', [colleague, on.staff])
  expect((await redeem(colleague, await codeOf(on.staff))).status).not.toBe('ok')

  for (const user of [a, b, c, l2]) expect(await codeGrants(user)).toEqual([])
})

it('lets a customer refused for a missing gift redeem the same code after the gift, paid once', async () => {
  const inviter = await createUser(db)
  const customer = await createUser(db)
  const code = await codeOf(inviter)
  expect((await redeem(customer, code)).status).toBe('blocked_no_signup_grant')
  // Still blocked: one row, the latest attempt.
  expect((await redeem(customer, code, 'account')).status).toBe('blocked_no_signup_grant')
  expect(await rowsOf(customer)).toEqual([expect.objectContaining({ status: 'blocked_no_signup_grant', credits_granted: 0 })])

  await giveGift(customer)
  const result = await redeem(customer, code, 'account')
  expect(result.status).toBe('ok')
  expect(await rowsOf(customer)).toEqual([expect.objectContaining({
    status: 'ok', blocked_status: 'blocked_no_signup_grant', had_block: true, credits_granted: result.credits_granted,
  })])
  expect(await codeGrants(customer)).toHaveLength(result.credits_granted ? 1 : 0)
  expect((await row(db, 'select redemption_count from codes where code=$1', [code])).redemption_count).toBe(1)
  expect((await redeem(customer, code, 'account')).status).toBe('used')
  expect((await redeem(customer, await codeOf(await createUser(db)), 'account')).status).toBe('already_invited')
  expect(await codeGrants(customer)).toHaveLength(result.credits_granted ? 1 : 0)
})

it('lets a customer blocked on one personal code use another inviter\'s code; only that inviter is rewarded', async () => {
  const neighbour = await createUser(db)
  const customer = await customerNextTo(neighbour)
  expect((await redeem(customer, await codeOf(neighbour))).status).toBe('blocked_same_ip')
  const friend = await createUser(db)
  await db.query('update profiles set signup_ip=$1 where id=$2', [uniqueIp(), friend])
  expect((await redeem(customer, await codeOf(friend), 'account')).status).toBe('ok')
  expect(await rowsOf(customer)).toEqual([expect.objectContaining({ status: 'ok', blocked_status: 'blocked_same_ip' })])
  expect((await row(db, 'select inviter_user_id from code_redemptions where user_id=$1', [customer])).inviter_user_id).toBe(friend)
  expect((await redeem(customer, await codeOf(neighbour), 'account')).status).toBe('already_invited')

  // The first payment rewards the friend only, once.
  const payment = await sale(db, customer, 'pack_m', 2490)
  const effects = () => db.query('select apply_payment_code_effects($1,$2,null,0,10,100) as r', [customer, payment.id])
  await effects()
  await effects()
  const rewarded = async (user: string) =>
    (await row(db, "select count(*)::int n from credit_ledger where kind='invite_reward' and user_id=$1", [user])).n as number
  expect(await rewarded(neighbour)).toBe(0)
  expect(await rewarded(friend)).toBeLessThanOrEqual(1)
})

it('pays a customer once when two retries race after the gift arrives', async () => {
  const inviter = await createUser(db)
  const customer = await createUser(db)
  const code = await codeOf(inviter)
  expect((await redeem(customer, code)).status).toBe('blocked_no_signup_grant')
  await giveGift(customer)
  const attempt = () => serviceClient().rpc('redeem_code', {
    p_user: customer, p_code: code, p_context: 'account', p_invitee_credits: null, p_invite_window_days: invite.windowDays,
  })
  const results = await Promise.all([attempt(), attempt(), attempt()])
  expect(results.map((r) => (r.data as { status: string }).status).sort()).toEqual(['ok', 'used', 'used'])
  expect(await rowsOf(customer)).toHaveLength(1)
  const granted = (await row(db, 'select credits_granted from code_redemptions where user_id=$1', [customer])).credits_granted
  expect(await codeGrants(customer)).toHaveLength(granted ? 1 : 0)
})
