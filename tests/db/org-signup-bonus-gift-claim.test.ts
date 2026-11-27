import { randomBytes } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { bind, promoter, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// 2023 (ARCHITECTURE §6.5): an org ?ref customer over the network's signup gift allowance (1480)
// is bound without the gift, so the 2010 trigger records blocked_no_signup_grant. When the account
// later claims the gift (claim_signup_gift, verified phone), it gets the org bonus once, at the
// amount set at the binding. Each test runs in a transaction that is rolled back. Fake data only.

let db: Client
let actor: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  for (const [key, value] of [['signup_gift_per_ip', 5], ['signup_gift_daily_cap', 100000], ['signup_gift_paused', false], ['signup_gift_claim_phone', true]] as const) {
    await db.query('insert into system_settings(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)])
  }
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const updatedAt = async (orgId: string) => (await row(db, 'select updated_at::text as at from orgs where id=$1', [orgId])).at as string
async function org(bonus: number) {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])).id as string
  await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, bonus, await updatedAt(orgId)])
  const { slug } = await row(db, 'select slug from affiliates where user_id=$1', [owner])
  return { owner, orgId, slug: slug as string }
}

const ip = () => `198.51.${randomBytes(1)[0]}.${((randomBytes(1)[0] ?? 0) % 250) + 1}`
// The signup gift as the first verified sign-in asks for it (grant_credits reads the amount itself).
const gift = async (user: string) => (await row(db, "select (grant_credits($1::uuid,1,'signup',$2,'free')).applied as ok", [user, 'signup:' + user])).ok as boolean
// Five accounts on one network take its allowance; the next one is pending.
async function pendingOnNetwork() {
  const address = ip()
  for (let i = 0; i < 5; i++) {
    const u = await createUser(db)
    await db.query('update profiles set signup_ip=$2 where id=$1', [u, address])
    expect(await gift(u)).toBe(true)
  }
  const sixth = await createUser(db)
  await db.query('update profiles set signup_ip=$2 where id=$1', [sixth, address])
  expect(await gift(sixth)).toBe(false)
  expect(await row(db, 'select signup_gift_refusal r from profiles where id=$1', [sixth])).toEqual({ r: 'same_ip_pending' })
  return sixth
}
const confirmPhone = (id: string) =>
  db.query("update auth.users set phone=$2, phone_confirmed_at=now() where id=$1", [id, `140${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, '0')}`])
const claim = async (id: string) => (await row(db, "select claim_signup_gift($1,'phone') as r", [id])).r as string
const bonusLedger = (user: string) =>
  db.query("select delta,idempotency_key from credit_ledger where user_id=$1 and kind='org_signup_bonus'", [user]).then((r) => r.rows)
const errorOf = async (user: string) => (await db.query('select error from org_signup_bonus_errors where user_id=$1', [user])).rows[0]?.error
const signupGifts = async (user: string) => (await row(db, "select count(*)::int n from credit_ledger where idempotency_key='signup:'||$1", [user])).n as number

it('the 6th account on one network via the org ?ref link gets the org bonus once it claims its gift, once', async () => {
  const { orgId, slug } = await org(350)
  const customer = await pendingOnNetwork()
  expect(await bind(db, customer, slug)).toBe(true)
  expect(await bonusLedger(customer)).toEqual([])
  expect(await errorOf(customer)).toBe('blocked_no_signup_grant')

  await confirmPhone(customer)
  expect(await claim(customer)).toBe('granted')
  expect(await signupGifts(customer)).toBe(1)
  expect(await bonusLedger(customer)).toEqual([{ delta: 350, idempotency_key: 'org_signup_bonus:' + customer }])
  expect(await row(db, 'select org_id,credits from org_signup_bonuses where user_id=$1', [customer])).toEqual({ org_id: orgId, credits: 350 })
  expect(await errorOf(customer)).toBeUndefined()

  // A repeated claim, a later sign-in's grant or the back-fill pay nothing more.
  expect(await claim(customer)).toBe('not_pending')
  expect(await gift(customer)).toBe(false)
  expect((await row(db, 'select admin_org_signup_bonus_backfill($1,$2,true) as r', [actor, customer])).r).toEqual({ status: 'already' })
  expect(await bonusLedger(customer)).toHaveLength(1)
  expect(await signupGifts(customer)).toBe(1)
})

it('pays the amount set at the binding, not a later one', async () => {
  const { orgId, slug } = await org(350)
  const customer = await pendingOnNetwork()
  expect(await bind(db, customer, slug)).toBe(true)
  await db.query("update admin_audit_log set created_at=created_at-interval '1 hour' where target_id=$1", [orgId])
  await db.query("update profiles set referred_at=now()-interval '30 minutes' where id=$1", [customer])
  await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, 500, await updatedAt(orgId)])
  await confirmPhone(customer)
  expect(await claim(customer)).toBe('granted')
  expect(await bonusLedger(customer)).toEqual([{ delta: 350, idempotency_key: 'org_signup_bonus:' + customer }])
})

it('no bonus at the claim for a customer who paid, became staff, or whose org turned the bonus off; the gift is still paid', async () => {
  const { orgId, slug } = await org(350)
  const paid = await pendingOnNetwork()
  const staff = await pendingOnNetwork()
  expect(await bind(db, paid, slug)).toBe(true)
  expect(await bind(db, staff, slug)).toBe(true)
  await sale(db, paid, 'pack_m', 2490)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [staff, invite_token])
  for (const u of [paid, staff]) {
    await confirmPhone(u)
    expect(await claim(u)).toBe('granted')
    expect(await signupGifts(u)).toBe(1)
    expect(await bonusLedger(u)).toEqual([])
    expect(await errorOf(u)).toBe('blocked_no_signup_grant')
  }

  const off = await pendingOnNetwork()
  expect(await bind(db, off, slug)).toBe(true)
  await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, 0, await updatedAt(orgId)])
  await confirmPhone(off)
  expect(await claim(off)).toBe('granted')
  expect(await bonusLedger(off)).toEqual([])
})

it('a personal partner\'s pending customer gets only the gift', async () => {
  const personal = await promoter(db)
  const customer = await pendingOnNetwork()
  expect(await bind(db, customer, personal.slug)).toBe(true)
  expect(await errorOf(customer)).toBeUndefined()
  await confirmPhone(customer)
  expect(await claim(customer)).toBe('granted')
  expect(await bonusLedger(customer)).toEqual([])
})
