import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// 2032 (ARCHITECTURE §6.4 / §6.5, Owner rule 2026-11-27): an org staff member's invite code gives
// the customer the signup gift and the org's signup bonus only: no personal invitee reward, and
// no personal inviter reward for the staff member on the first payment. Personal codes unchanged.
// Each test runs in a transaction that is rolled back. Fake data only.

let db: Client
let actor: string
const REWARDS = { inviteeCredits: 6, inviterCredits: 10 }
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  await db.query("update system_settings set value=$1::jsonb where key='code_invite_rewards'", [JSON.stringify(REWARDS)])
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function orgTeam(bonus: number) {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])).id as string
  if (bonus) {
    const { at } = await row(db, 'select updated_at::text as at from orgs where id=$1', [orgId])
    await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, bonus, at])
  }
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  const staff = await createUser(db)
  await db.query('select org_join($1,$2)', [staff, invite_token])
  return { orgId, staff }
}
const codeOf = async (user: string) => (await row(db, 'select get_or_create_invite_code($1) as code', [user])).code as string
async function invitedBy(inviter: string) {
  const customer = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
  const result = (await row(db, "select redeem_code($1,$2,'signup',null,$3) as r", [customer, await codeOf(inviter), invite.windowDays])).r
  return { customer, result: result as { status: string; credits_granted: number } }
}
const ledger = (user: string, kind: string) =>
  db.query('select delta from credit_ledger where user_id=$1 and kind=$2', [user, kind]).then((r) => r.rows.map((x) => x.delta as number))
async function firstPayment(customer: string) {
  const { id } = await sale(db, customer, 'pack_m', 2490)
  return (await row(db, 'select apply_payment_code_effects($1,$2,null,0,10,100,30) as r', [customer, id])).r as { rewarded: boolean }
}
const preview = (code: string) => row(db, 'select code_preview_credits(c) as credits, code_preview_org(c) as org from codes c where code=$1', [code])

it('a staff code: no personal invitee credits, org_l1 binding and the org bonus, no inviter reward on the first payment', async () => {
  const { orgId, staff } = await orgTeam(300)
  const { customer, result } = await invitedBy(staff)
  expect(result).toMatchObject({ status: 'ok', credits_granted: 0 })
  expect(await ledger(customer, 'code_grant')).toEqual([])
  expect(await row(db, 'select org_invite from code_redemptions where user_id=$1', [customer])).toEqual({ org_invite: true })
  const account = (await row(db, 'select user_id from affiliates where org_id=$1', [orgId])).user_id
  expect(await row(db, 'select referred_by,referred_source,referred_member from profiles where id=$1', [customer]))
    .toEqual({ referred_by: account, referred_source: 'org_l1', referred_member: staff })
  expect(await ledger(customer, 'org_signup_bonus')).toEqual([300])
  expect(await firstPayment(customer)).toMatchObject({ rewarded: false })
  expect(await ledger(staff, 'invite_reward')).toEqual([])
})

it('a personal code keeps both rewards', async () => {
  const friend = await createUser(db)
  const { customer, result } = await invitedBy(friend)
  expect(result).toMatchObject({ status: 'ok', credits_granted: REWARDS.inviteeCredits })
  expect(await ledger(customer, 'code_grant')).toEqual([REWARDS.inviteeCredits])
  expect(await row(db, 'select org_invite from code_redemptions where user_id=$1', [customer])).toEqual({ org_invite: false })
  expect(await firstPayment(customer)).toMatchObject({ rewarded: true })
  expect(await ledger(friend, 'invite_reward')).toEqual([REWARDS.inviterCredits])
})

it('an org customer\'s own personal code (org_l2) keeps both rewards', async () => {
  const { staff } = await orgTeam(0)
  const l1 = (await invitedBy(staff)).customer
  const { customer, result } = await invitedBy(l1)
  expect(result).toMatchObject({ status: 'ok', credits_granted: REWARDS.inviteeCredits })
  expect(await firstPayment(customer)).toMatchObject({ rewarded: true })
  expect(await ledger(l1, 'invite_reward')).toEqual([REWARDS.inviterCredits])
})

it('a staff-code redemption from before 2032 (not marked) gets no inviter reward either', async () => {
  const { staff } = await orgTeam(0)
  const { customer } = await invitedBy(staff)
  await db.query('update code_redemptions set org_invite=false where user_id=$1', [customer])
  expect(await firstPayment(customer)).toMatchObject({ rewarded: false })
  expect(await ledger(staff, 'invite_reward')).toEqual([])
})

it('the sign-up preview shows the org bonus for a staff code, nothing extra without one, and the personal reward otherwise', async () => {
  const withBonus = await orgTeam(350)
  expect(await preview(await codeOf(withBonus.staff))).toEqual({ credits: 350, org: true })
  const without = await orgTeam(0)
  expect(await preview(await codeOf(without.staff))).toEqual({ credits: 0, org: true })
  expect(await preview(await codeOf(await createUser(db)))).toEqual({ credits: REWARDS.inviteeCredits, org: false })
})
