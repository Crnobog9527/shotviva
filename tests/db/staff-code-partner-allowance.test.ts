import { randomBytes } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser, serviceClient, uniqueIp } from './helpers'

// 2031 (ARCHITECTURE §6.5 / §7, Codex validation 2026-11-27): a sign-up through an org staff
// member's invite code gets the same allowances as one through the org's ?ref link: the looser
// sign-up request and SMS limits per IP (2027) and the per-network signup gift allowance (2024),
// decided in SQL from the code. Personal codes keep the site-wide numbers. Each test runs in a
// transaction that is rolled back. Fake data only.

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
  for (const [key, value] of [
    ['signup_gift_per_ip', 5], ['signup_gift_per_ip_partner', 20], ['signup_gift_paused', false],
    ['signup_request_ip_hourly', 2], ['signup_request_ip_hourly_partner', 4], ['signup_request_ip_daily', 100], ['signup_request_ip_daily_partner', 100],
    ['sms_ip_daily', 2], ['sms_ip_daily_partner', 4],
  ] as const) await setSetting(key, value)
  await db.query("update profiles set signup_gift_refusal='paused' where signup_gift_refusal='daily_cap'")
  await roomFor(100000)
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function orgStaff(opts: { affiliate?: boolean } = {}) {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor,
    { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: opts.affiliate ?? true }])).id as string
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  const staff = await createUser(db)
  await db.query('select org_join($1,$2)', [staff, invite_token])
  const code = (await row(db, 'select get_or_create_invite_code($1) as code', [staff])).code as string
  return { orgId, staff, code }
}
const personalCode = async () => (await row(db, 'select get_or_create_invite_code($1) as code', [await createUser(db)])).code as string
const hex = () => randomBytes(32).toString('hex')
const signup = async (address: string, code: string | null) =>
  (await row(db, 'select signup_request($1,$2::inet,null,$3) as s', [hex(), address, code])).s as string
const sms = async (address: string, code: string | null) =>
  (await row(db, 'select sms_request_send($1,$2::inet,null,$3) as s', [hex(), address, code])).s as string
const gift = async (user: string) => (await row(db, "select (grant_credits($1::uuid,1,'signup',$2,'free')).applied as ok", [user, 'signup:' + user])).ok as boolean
const stage = async (user: string, code: string | null) => (await row(db, 'select signup_code_stage($1,$2) as ok', [user, code])).ok as boolean
const redeemAtSignup = async (user: string, code: string) =>
  (await row(db, "select redeem_code($1,$2,'signup',null,$3) as r", [user, code, invite.windowDays])).r as { status: string }
const refusalOf = async (user: string) => (await row(db, 'select signup_gift_refusal r from profiles where id=$1', [user])).r

it('a staff invite code in the sign-up form gets the org link\'s sign-up request limit; personal codes do not', async () => {
  const { code } = await orgStaff()
  const address = '203.0.113.' + (1 + (randomBytes(1)[0]! % 250))
  await db.query('delete from signup_requests where ip=$1::inet', [address])
  expect(await signup(address, null)).toBe('ok')
  expect(await signup(address, null)).toBe('ok')
  expect(await signup(address, null)).toBe('ip_hourly')
  expect(await signup(address, await personalCode())).toBe('ip_hourly')
  expect(await signup(address, code.toLowerCase())).toBe('ok')
  expect(await signup(address, code)).toBe('ok')
  expect(await signup(address, code)).toBe('ip_hourly')
  // An org with its affiliate switch off does not loosen anything; nor junk.
  const off = await orgStaff({ affiliate: false })
  expect(await signup(address, off.code)).toBe('ip_hourly')
  expect(await signup(address, "x'--")).toBe('ip_hourly')
  // A code redeem_code would refuse loosens nothing either: its owner banned, or the code full.
  const banned = await orgStaff()
  await db.query('update profiles set banned_at=now() where id=$1', [banned.staff])
  expect(await signup(address, banned.code)).toBe('ip_hourly')
  const full = await orgStaff()
  await db.query('update codes set max_redemptions=1, redemption_count=1 where code=$1', [full.code])
  expect(await signup(address, full.code)).toBe('ip_hourly')
  // With room left it loosens again (a fresh network: this one used its org allowance above).
  await db.query('update codes set max_redemptions=2 where code=$1', [full.code])
  const other = '198.51.100.' + (1 + (randomBytes(1)[0]! % 250))
  await db.query('delete from signup_requests where ip=$1::inet', [other])
  for (let i = 0; i < 2; i++) expect(await signup(other, null)).toBe('ok')
  expect(await signup(other, full.code)).toBe('ok')
  // The 3-argument call (code from before this deploy) still works.
  expect((await row(db, 'select signup_request($1,$2::inet,null::text) as s', [hex(), '198.51.100.9'])).s).toBe('ok')
})

it('a staff invite code in the phone form gets the org link\'s SMS limit per IP', async () => {
  const { code } = await orgStaff()
  const address = '203.0.113.' + (1 + (randomBytes(1)[0]! % 250))
  await db.query('delete from sms_sends where ip=$1::inet', [address])
  expect(await sms(address, null)).toBe('ok')
  expect(await sms(address, null)).toBe('ok')
  expect(await sms(address, await personalCode())).toBe('ip_daily')
  expect(await sms(address, code)).toBe('ok')
  expect(await sms(address, code)).toBe('ok')
  expect(await sms(address, code)).toBe('ip_daily')
})

// The Codex case: the shop network already had 5 gifts; the 6th customer signs up with a staff code.
async function fullNetwork() {
  const address = uniqueIp()
  for (let i = 0; i < 5; i++) {
    const u = await createUser(db)
    await db.query('update profiles set signup_ip=$2 where id=$1', [u, address])
    expect(await gift(u)).toBe(true)
  }
  const user = await createUser(db)
  await db.query('update profiles set signup_ip=$2 where id=$1', [user, address])
  return user
}

it('a staged staff code gets the org channel\'s gift allowance, and the code then binds the customer to the org', async () => {
  const { orgId, staff, code } = await orgStaff()
  const user = await fullNetwork()
  expect(await stage(user, code)).toBe(true)
  expect(await gift(user)).toBe(true)
  expect(await stage(user, null)).toBe(false)
  expect((await redeemAtSignup(user, code)).status).toBe('ok')
  const account = (await row(db, 'select user_id from affiliates where org_id=$1', [orgId])).user_id
  expect(await row(db, 'select referred_by,referred_source,referred_member from profiles where id=$1', [user]))
    .toEqual({ referred_by: account, referred_source: 'org_l1', referred_member: staff })
})

it('a personal code, an old stage, or none keeps the site-wide allowance', async () => {
  const personal = await fullNetwork()
  expect(await stage(personal, await personalCode())).toBe(true)
  expect(await gift(personal)).toBe(false)
  expect(await refusalOf(personal)).toBe('same_ip_pending')

  const { code } = await orgStaff()
  const stale = await fullNetwork()
  expect(await stage(stale, code)).toBe(true)
  await db.query("update signup_code_staged set created_at=now()-interval '2 hours' where user_id=$1", [stale])
  expect(await gift(stale)).toBe(false)

  const none = await fullNetwork()
  expect(await gift(none)).toBe(false)
})

it('a stage is refused once the gift was paid, and the browser roles cannot reach it', async () => {
  const { code } = await orgStaff()
  const user = await createUser(db)
  expect(await gift(user)).toBe(true)
  expect(await stage(user, code)).toBe(false)
  expect(await stage(user, 'bad code')).toBe(false)
  await db.query('savepoint s')
  await db.query('set local role authenticated')
  await expect(db.query('select signup_code_stage($1,$2)', [user, code])).rejects.toThrow(/permission denied/)
  await db.query('rollback to savepoint s')
})

it('a daily-cap pending staff-code sign-up on a full network is paid by the catch-up and then bound to the org', async () => {
  const { orgId, code } = await orgStaff()
  const user = await fullNetwork()
  // The first sign-in: the staged code passes the network, but the day is full.
  await roomFor(0)
  expect(await stage(user, code)).toBe(true)
  expect(await gift(user)).toBe(false)
  expect(await refusalOf(user)).toBe('daily_cap')
  await stage(user, null)
  expect((await redeemAtSignup(user, code)).status).toBe('blocked_no_signup_grant')
  // The catch-up has no stage: the refused sign-up redemption carries the staff code instead.
  await roomFor(1)
  expect((await row(db, 'select signup_gift_catch_up_one($1) r', [user])).r).toBe('paid')
  const account = (await row(db, 'select user_id from affiliates where org_id=$1', [orgId])).user_id
  expect((await row(db, 'select referred_by from profiles where id=$1', [user])).referred_by).toBe(account)
})

it('is not callable through the API by anyone but the service role', async () => {
  const { error } = await serviceClient().rpc('signup_code_stage', { p_user: '00000000-0000-4000-8000-000000000000', p_code: null })
  expect(error).toBeNull()
})
