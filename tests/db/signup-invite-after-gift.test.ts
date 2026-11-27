import { randomBytes } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser, uniqueIp } from './helpers'

// 2030 (review on #977): an invite code typed at sign-up but refused because the signup gift was
// not paid yet (blocked_no_signup_grant) is redeemed once, automatically, when the gift is finally
// paid: the daily catch-up or a later sign-in (2026), or claim_signup_gift (1480). The account page
// and the paywall stay closed to invite codes. Each test runs in a transaction that is rolled back.
// Fake data only.

let db: Client
let actor: string
const setSetting = (key: string, value: unknown) =>
  db.query('insert into system_settings(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)])
const granted = async () => Number((await row(db, "select signup_gift_today()->>'granted' g")).g)
const roomFor = async (n: number) => setSetting('signup_gift_daily_cap', (await granted()) + n)

beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  for (const [key, value] of [['signup_gift_per_ip', 5], ['signup_gift_paused', false], ['signup_gift_claim_phone', true]] as const) await setSetting(key, value)
  await db.query("delete from system_settings where key='signup_gift_per_ip_partner'")
  await db.query("update profiles set signup_gift_refusal='paused' where signup_gift_refusal='daily_cap'")
  await roomFor(100000)
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const gift = async (user: string) => (await row(db, "select (grant_credits($1::uuid,1,'signup',$2,'free')).applied as ok", [user, 'signup:' + user])).ok as boolean
const codeOf = async (user: string) => (await row(db, 'select get_or_create_invite_code($1) as code', [user])).code as string
const redeemAtSignup = async (user: string, code: string) =>
  (await row(db, "select redeem_code($1,$2,'signup',null,$3) as r", [user, code, invite.windowDays])).r as { status: string }
const inviteRows = (user: string) =>
  db.query("select status,blocked_status,credits_granted from code_redemptions where user_id=$1 and kind='invite'", [user]).then((r) => r.rows)
const codeGrants = async (user: string) => (await row(db, "select count(*)::int n from credit_ledger where user_id=$1 and kind='code_grant'", [user])).n as number
const errorOf = async (user: string) => (await db.query('select error from signup_invite_retry_errors where user_id=$1', [user])).rows[0]?.error
const confirmPhone = (id: string) =>
  db.query("update auth.users set phone=$2, phone_confirmed_at=now() where id=$1", [id, `140${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, '0')}`])

// The first verified sign-in on a day with no room left: the gift is pending for the daily cap, so
// the code typed at sign-up is refused for the missing gift.
async function cappedWithCode(code: string) {
  await roomFor(0)
  const user = await createUser(db)
  await db.query('update profiles set signup_ip=$2 where id=$1', [user, uniqueIp()])
  expect(await gift(user)).toBe(false)
  expect((await redeemAtSignup(user, code)).status).toBe('blocked_no_signup_grant')
  return user
}

it('a daily-cap pending account gets its sign-up invite when the daily catch-up pays the gift, once', async () => {
  const inviter = await createUser(db)
  const user = await cappedWithCode(await codeOf(inviter))
  await roomFor(1)
  expect((await row(db, 'select signup_gift_catch_up_one($1) r', [user])).r).toBe('paid')
  const rows = await inviteRows(user)
  expect(rows).toEqual([expect.objectContaining({ status: 'ok', blocked_status: 'blocked_no_signup_grant' })])
  expect(await codeGrants(user)).toBe(rows[0].credits_granted > 0 ? 1 : 0)
  // Nothing pays twice: a later sign-in's grant, another catch-up, the code again.
  expect(await gift(user)).toBe(false)
  expect((await row(db, 'select signup_gift_catch_up_one($1) r', [user])).r).not.toBe('paid')
  expect((await redeemAtSignup(user, await codeOf(inviter))).status).toBe('used')
  expect(await codeGrants(user)).toBe(rows[0].credits_granted > 0 ? 1 : 0)
  expect(await errorOf(user)).toBeUndefined()
})

it('the same applies when a later sign-in pays the gift, even more than 7 days after sign-up', async () => {
  const inviter = await createUser(db)
  const user = await cappedWithCode(await codeOf(inviter))
  await db.query("update profiles set created_at=now()-interval '10 days' where id=$1", [user])
  await roomFor(1)
  expect(await gift(user)).toBe(true)
  expect(await inviteRows(user)).toEqual([expect.objectContaining({ status: 'ok' })])
})

it('a same_ip_pending account gets an org staff invite (org_l1 binding and the org bonus) when it claims the gift', async () => {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])).id as string
  const { at } = await row(db, 'select updated_at::text as at from orgs where id=$1', [orgId])
  await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, 300, at])
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  const staff = await createUser(db)
  await db.query('select org_join($1,$2)', [staff, invite_token])

  // Five accounts take the network's allowance; the sixth is pending and enters the staff code.
  const address = uniqueIp()
  for (let i = 0; i < 5; i++) {
    const u = await createUser(db)
    await db.query('update profiles set signup_ip=$2 where id=$1', [u, address])
    expect(await gift(u)).toBe(true)
  }
  const user = await createUser(db)
  await db.query('update profiles set signup_ip=$2 where id=$1', [user, address])
  expect(await gift(user)).toBe(false)
  expect((await redeemAtSignup(user, await codeOf(staff))).status).toBe('blocked_no_signup_grant')

  await confirmPhone(user)
  expect((await row(db, "select claim_signup_gift($1,'phone') r", [user])).r).toBe('granted')
  expect(await inviteRows(user)).toEqual([expect.objectContaining({ status: 'ok' })])
  const account = (await row(db, 'select user_id from affiliates where org_id=$1', [orgId])).user_id
  expect(await row(db, 'select referred_by,referred_source,referred_member from profiles where id=$1', [user]))
    .toEqual({ referred_by: account, referred_source: 'org_l1', referred_member: staff })
  const bonus = async () => (await db.query("select delta from credit_ledger where user_id=$1 and kind='org_signup_bonus'", [user])).rows
  expect(await bonus()).toEqual([{ delta: 300 }])
  expect((await row(db, "select claim_signup_gift($1,'phone') r", [user])).r).toBe('not_pending')
  expect(await bonus()).toHaveLength(1)
})

it('does not apply the code for an account that paid in between; the gift is still paid', async () => {
  const inviter = await createUser(db)
  const user = await cappedWithCode(await codeOf(inviter))
  await sale(db, user, 'pack_m', 2490)
  await roomFor(1)
  expect(await gift(user)).toBe(true)
  expect(await inviteRows(user)).toEqual([expect.objectContaining({ status: 'blocked_no_signup_grant' })])
  expect(await codeGrants(user)).toBe(0)
})

it('leaves an account with no blocked sign-up invite, or one blocked on the same network, alone', async () => {
  const plain = await createUser(db)
  expect(await gift(plain)).toBe(true)
  expect(await inviteRows(plain)).toEqual([])
  // A personal code refused for the same network stays refused: the gift does not change that.
  const neighbour = await createUser(db)
  const user = await createUser(db)
  const address = uniqueIp()
  await db.query('update profiles set signup_ip=$2 where id in ($1,$3)', [user, address, neighbour])
  await roomFor(0)
  expect(await gift(user)).toBe(false)
  // Same network comes first (2025's order), so this is not a missing-gift refusal.
  expect((await redeemAtSignup(user, await codeOf(neighbour))).status).toBe('blocked_same_ip')
  await roomFor(1)
  expect(await gift(user)).toBe(true)
  expect(await inviteRows(user)).toEqual([expect.objectContaining({ status: 'blocked_same_ip' })])
  expect(await codeGrants(user)).toBe(0)
})
