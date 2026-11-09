import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { benefits, pack } from '../t94-config'
import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'

let db: Client
let actor: string
let owner: string
let code: string
const defaults = { inviteeCredits: 6, inviterCredits: 10 }

beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await createUser(db)
  owner = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
  code = (await db.query('select public.get_or_create_invite_code($1) as code', [owner])).rows[0].code
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

function save(invitee: number, inviter: number, expected = defaults, admin = actor) {
  return db.query('select public.admin_save_invite_rewards($1,$2,$3,$4)', [admin, invitee, inviter, expected])
}

async function rejected(work: () => Promise<unknown>, reason: string) {
  await db.query('savepoint rejected')
  await expect(work()).rejects.toMatchObject({ message: reason })
  await db.query('rollback to savepoint rejected')
}

async function signup() {
  const buyer = await createUser(db)
  await db.query("select public.grant_credits($1,$2,'signup',$3,'free')", [buyer, benefits.freeCredits, 'signup:' + buyer])
  return buyer
}

async function redeem(buyer: string, manual = false) {
  const rpc = manual ? 'redeem_limited_code' : 'redeem_code'
  const context = manual ? 'account' : 'signup'
  return (await db.query(`select public.${rpc}($1,$2,$3,999999,7) as claim`, [buyer, code, context])).rows[0].claim
}

async function settle(buyer: string) {
  const session = 'cs_' + randomUUID()
  await db.query("select public.settle_checkout($1,$2,$3,$4,'usd',0,'card',null,$5)",
    [buyer, pack.id, session, Math.round(pack.priceUsd * 100), 'ch_' + randomUUID()])
  return (await db.query('select id from public.payments where stripe_session_id=$1', [session])).rows[0].id
}

async function effects(buyer: string, payment: string, extended = false) {
  const windowArg = extended ? ',30' : ''
  return (await db.query(`select public.apply_payment_code_effects($1,$2,null,0,999999,20${windowArg}) as result`,
    [buyer, payment])).rows[0].result
}

it('restricts saves to active admins, rejects stale/invalid updates and audits the pair atomically', async () => {
  await rejected(() => save(3, 4, defaults, owner), 'NOT_ADMIN')
  await rejected(() => save(-1, 1), 'INVALID_INPUT')
  await rejected(() => save(1, 10_001), 'INVALID_INPUT')
  await db.query("update public.profiles set banned_at=now() where id=$1", [actor])
  await rejected(() => save(3, 4), 'NOT_ADMIN')
  await db.query("update public.profiles set banned_at=null where id=$1", [actor])
  for (const role of ['anon', 'authenticated']) {
    const signature = 'public.admin_save_invite_rewards(uuid,integer,integer,jsonb)'
    expect((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, signature])).rows[0].allowed).toBe(false)
  }
  // Exercise the same database role the authenticated admin action uses through PostgREST.
  await db.query('set local role service_role')
  await save(0, 10000)
  await rejected(() => save(11, 12), 'INVITE_SETTINGS_CHANGED')
  await db.query('reset role')
  const audit = await db.query("select reason::jsonb from public.admin_audit_log where user_id=$1 and target_id='code_invite_rewards'", [actor])
  expect(audit.rows).toEqual([{ reason: { before: defaults, after: { inviteeCredits: 0, inviterCredits: 10000 } } }])
})

it('uses the setting at each trigger, preserves historical amounts and finalizes a zero decision on replay', async () => {
  const buyer = await signup()
  await save(17, 0)
  expect((await db.query('select public.code_preview_credits(c) as credits from public.codes c where code=$1', [code])).rows[0].credits).toBe(17)
  expect(await redeem(buyer)).toMatchObject({ status: 'ok', credits_granted: 17, pool: 'free' })
  expect((await profileOf(db, buyer)).free_credits).toBe(benefits.freeCredits + 17)
  const first = await settle(buyer)
  expect(await effects(buyer, first)).toMatchObject({ applied: true, rewarded: false })
  await save(0, 23, { inviteeCredits: 17, inviterCredits: 0 })
  expect(await effects(buyer, first, true)).toMatchObject({ applied: false, rewarded: false })
  expect(await effects(buyer, await settle(buyer))).toMatchObject({ rewarded: false })
  expect(await ledgerOf(db, owner)).toHaveLength(0)

  const next = await signup()
  expect(await redeem(next, true)).toMatchObject({ status: 'ok', credits_granted: 0 })
  expect(await redeem(next)).toMatchObject({ status: 'used' })
  expect((await profileOf(db, next)).free_credits).toBe(benefits.freeCredits)
  expect(await ledgerOf(db, next)).toHaveLength(1)
  await save(31, 37, { inviteeCredits: 0, inviterCredits: 23 })
  const payment = await settle(next)
  expect(await effects(next, payment, true)).toMatchObject({ rewarded: true, reward_credits: 37, inviter_id: owner })
  expect(await effects(next, payment)).toMatchObject({ applied: false, rewarded: false })
  expect(await ledgerOf(db, owner)).toEqual([expect.objectContaining({ kind: 'invite_reward', pool: 'paid', delta: 37 })])
  expect((await profileOf(db, buyer)).free_credits).toBe(benefits.freeCredits + 17)
  expect((await db.query('select public.my_invite_summary($1,20) as summary', [owner])).rows[0].summary)
    .toMatchObject({ rewards: { inviteeCredits: 31, inviterCredits: 37 }, invited: 2, purchasers: 2, earned: 37, rewards_left: 19 })
})
