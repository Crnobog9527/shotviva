import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { bind, row } from './affiliate-fixtures'
import { connectAdmin, createUser, uniqueIp } from './helpers'

// 2026 (ARCHITECTURE §7): a signup gift refused for the daily cap is pending. grant_credits pays it
// at a later call (the next verified sign-in) when the day has room, and signup_gift_catch_up
// (the daily cron) pays the oldest pending accounts first, within today's cap. Same 'signup:<id>'
// key and amount rule, so never twice; the pause, the per-network allowance and bans still apply;
// the org bonus follows. Each test runs in a transaction that is rolled back; settings are written
// inside it, and every network is a fresh uniqueIp(). Fake data only.

let db: Client
const setSetting = (key: string, value: unknown) =>
  db.query('insert into system_settings(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)])
const granted = async () => Number((await row(db, "select signup_gift_today()->>'granted' g")).g)
// Room for exactly n more gifts today.
const roomFor = async (n: number) => setSetting('signup_gift_daily_cap', (await granted()) + n)

beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  for (const [key, value] of [['signup_gift_per_ip', 5], ['signup_gift_paused', false]] as const) await setSetting(key, value)
  await db.query("delete from system_settings where key='signup_gift_per_ip_partner'")
  // Other files' pending accounts stay out of this file's catch-up runs (rolled back).
  await db.query("update profiles set signup_gift_refusal='paused' where signup_gift_refusal='daily_cap'")
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const gift = async (user: string) => (await row(db, "select (grant_credits($1::uuid,1,'signup',$2,'free')).applied as ok", [user, 'signup:' + user])).ok as boolean
const refusalOf = async (user: string) => (await row(db, 'select signup_gift_refusal r from profiles where id=$1', [user])).r
const giftRows = async (user: string) =>
  (await db.query("select delta from credit_ledger where idempotency_key='signup:'||$1::text", [user])).rows.map((r) => r.delta as number)
const catchUp = async (limit = 50) => (await row(db, 'select signup_gift_catch_up($1) r', [limit])).r as Record<string, unknown>
const amountFor = async (user: string) => (await row(db, 'select signup_gift_amount(created_at) a from profiles where id=$1', [user])).a as number

// A sign-up on a fresh network on a day with no room left: pending for the daily cap. `ageSeconds`
// orders the sign-ups (oldest first) without leaving the gift's era.
async function capped(ageSeconds = 0, address = uniqueIp()) {
  await roomFor(0)
  const user = await createUser(db)
  await db.query("update profiles set signup_ip=$2, created_at=now()-make_interval(secs=>$3) where id=$1", [user, address, ageSeconds])
  expect(await gift(user)).toBe(false)
  expect(await refusalOf(user)).toBe('daily_cap')
  return user
}

it('a daily-cap refusal is paid at a later sign-in once the day has room, once, at the account\'s amount', async () => {
  const user = await capped()
  expect(await gift(user)).toBe(false)
  await roomFor(1)
  expect(await gift(user)).toBe(true)
  expect(await giftRows(user)).toEqual([await amountFor(user)])
  expect(await refusalOf(user)).toBeNull()
  // Any later sign-in or catch-up is a no-op.
  await roomFor(5)
  expect(await gift(user)).toBe(false)
  expect((await catchUp()).paid).toBe(0)
  expect(await giftRows(user)).toHaveLength(1)
})

it('the catch-up pays the oldest pending accounts first and stops at today\'s cap', async () => {
  const newest = await capped(10)
  const oldest = await capped(30)
  const middle = await capped(20)
  await roomFor(2)
  expect(await catchUp()).toEqual({ paid: 2, tried: 2, failed: 0, stopped: 'daily_cap', remaining: 1 })
  expect(await giftRows(oldest)).toHaveLength(1)
  expect(await giftRows(middle)).toHaveLength(1)
  expect(await giftRows(newest)).toEqual([])
  expect(await refusalOf(newest)).toBe('daily_cap')
  // The cap counts catch-ups like any gift: a new sign-up now waits too.
  const fresh = await createUser(db)
  expect(await gift(fresh)).toBe(false)
  expect(await refusalOf(fresh)).toBe('daily_cap')
})

it('the catch-up is bounded by its limit', async () => {
  for (let i = 0; i < 3; i++) await capped(i)
  await roomFor(10)
  expect(await catchUp(2)).toEqual({ paid: 2, tried: 2, failed: 0, stopped: null, remaining: 1 })
  for (const bad of [0, 501]) {
    await db.query('savepoint bad')
    await expect(db.query('select signup_gift_catch_up($1)', [bad])).rejects.toThrow('INVALID_INPUT')
    await db.query('rollback to savepoint bad')
  }
})

it('the pause holds a pending account back without ending it; a new sign-up during the pause is refused for good', async () => {
  const user = await capped()
  await roomFor(5)
  await setSetting('signup_gift_paused', true)
  expect(await gift(user)).toBe(false)
  expect(await refusalOf(user)).toBe('daily_cap')
  expect(await catchUp()).toMatchObject({ paid: 0, tried: 0, stopped: 'paused', remaining: 1 })
  const during = await createUser(db)
  expect(await gift(during)).toBe(false)
  expect(await refusalOf(during)).toBe('paused')
  await setSetting('signup_gift_paused', false)
  expect((await catchUp()).paid).toBe(1)
  expect(await giftRows(user)).toHaveLength(1)
  expect(await gift(during)).toBe(false)
})

it('a banned account is never paid; a deleted one is gone from the queue', async () => {
  const banned = await capped(20)
  const deleted = await capped(10)
  await db.query('update profiles set banned_at=now() where id=$1', [banned])
  await db.query('delete from auth.users where id=$1', [deleted])
  await roomFor(5)
  expect(await gift(banned)).toBe(false)
  expect(await catchUp()).toEqual({ paid: 0, tried: 0, failed: 0, stopped: null, remaining: 0 })
  expect(await giftRows(banned)).toEqual([])
})

it('the per-network allowance is counted again when it is paid: over it, the account becomes claimable instead', async () => {
  const address = uniqueIp()
  const user = await capped(0, address)
  await roomFor(10)
  for (let i = 0; i < 5; i++) {
    const other = await createUser(db)
    await db.query('update profiles set signup_ip=$2 where id=$1', [other, address])
    expect(await gift(other)).toBe(true)
  }
  expect(await catchUp()).toMatchObject({ paid: 0, tried: 1, failed: 0, remaining: 0 })
  expect(await refusalOf(user)).toBe('same_ip_pending')
  expect(await giftRows(user)).toEqual([])
})

it('an org ?ref customer caught up gets the org bonus with the gift', async () => {
  const actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])).id as string
  const { at } = await row(db, 'select updated_at::text as at from orgs where id=$1', [orgId])
  await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, 350, at])
  const { slug } = await row(db, 'select slug from affiliates where user_id=$1', [owner])

  await roomFor(0)
  const user = await createUser(db)
  await db.query('update profiles set signup_ip=$2 where id=$1', [user, uniqueIp()])
  expect(await bind(db, user, slug as string)).toBe(true)
  expect(await gift(user)).toBe(false)
  expect(await refusalOf(user)).toBe('daily_cap')
  expect((await db.query('select error from org_signup_bonus_errors where user_id=$1', [user])).rows[0]?.error).toBe('blocked_no_signup_grant')

  await roomFor(1)
  expect((await catchUp()).paid).toBe(1)
  expect((await db.query("select delta from credit_ledger where user_id=$1 and kind='org_signup_bonus'", [user])).rows.map((r) => r.delta)).toEqual([350])
  expect((await db.query('select 1 from org_signup_bonus_errors where user_id=$1', [user])).rowCount).toBe(0)
})

it('only the service role runs the catch-up', async () => {
  expect(await row(db, "select has_function_privilege('authenticated','public.signup_gift_catch_up(integer)','execute') u, has_function_privilege('anon','public.signup_gift_catch_up(integer)','execute') a, has_function_privilege('service_role','public.signup_gift_catch_up(integer)','execute') s"))
    .toEqual({ u: false, a: false, s: true })
})
