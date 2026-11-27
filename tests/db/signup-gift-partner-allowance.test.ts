import { randomBytes } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { bind, promoter, row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// 2024 (ARCHITECTURE §6.5, §7): a sign-up bound through an org partner's ?ref link gets the
// per-network allowance signup_gift_per_ip_partner (default 20) instead of signup_gift_per_ip (5
// here, as on prod), and the org bonus right after the gift. The app binds the link before the
// gift at the first verified sign-in (core/auth/first-sign-in.ts); these tests do the same: signup
// IP, affiliate_bind, then the signup grant. Each test runs in a transaction that is rolled back.
// Fake data only.

let db: Client
let actor: string
const setSetting = (key: string, value: unknown) =>
  db.query('insert into system_settings(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)])
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  await db.query("delete from system_settings where key='signup_gift_per_ip_partner'")
  for (const [key, value] of [['signup_gift_per_ip', 5], ['signup_gift_daily_cap', 100000], ['signup_gift_paused', false]] as const) await setSetting(key, value)
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
  return { orgId, slug: slug as string }
}

const ip = () => `192.0.${randomBytes(1)[0]}.${((randomBytes(1)[0] ?? 0) % 250) + 1}`
// One email sign-up's first verified sign-in, in the app's order: IP, partner link, gift.
async function signUp(address: string, slug?: string) {
  const user = await createUser(db)
  await db.query('update profiles set signup_ip=$2 where id=$1', [user, address])
  if (slug) expect(await bind(db, user, slug)).toBe(true)
  const { ok } = await row(db, "select (grant_credits($1::uuid,1,'signup',$2,'free')).applied as ok", [user, 'signup:' + user])
  return { user, gifted: ok as boolean }
}
const bonusOf = async (user: string) =>
  (await db.query("select delta from credit_ledger where user_id=$1 and kind='org_signup_bonus'", [user])).rows.map((r) => r.delta as number)
const errorOf = async (user: string) => (await db.query('select error from org_signup_bonus_errors where user_id=$1', [user])).rows[0]?.error
const refusalOf = async (user: string) => (await row(db, 'select signup_gift_refusal r from profiles where id=$1', [user])).r

it('on one network, the 6th to 20th sign-ups through an org ?ref link get the gift and the org bonus; the 21st is pending', async () => {
  const { slug } = await org(350)
  const address = ip()
  for (let i = 1; i <= 5; i++) expect((await signUp(address)).gifted).toBe(true)
  for (let i = 6; i <= 20; i++) {
    const { user, gifted } = await signUp(address, slug)
    expect(gifted).toBe(true)
    expect(await bonusOf(user)).toEqual([350])
    expect(await errorOf(user)).toBeUndefined()
  }
  const last = await signUp(address, slug)
  expect(last.gifted).toBe(false)
  expect(await refusalOf(last.user)).toBe('same_ip_pending')
  expect(await bonusOf(last.user)).toEqual([])
  expect(await errorOf(last.user)).toBe('blocked_no_signup_grant')
})

it('a personal partner\'s link and no link keep the site-wide allowance: the 6th is pending', async () => {
  const { slug } = await org(350)
  const personal = await promoter(db)
  const address = ip()
  for (let i = 1; i <= 5; i++) expect((await signUp(address, slug)).gifted).toBe(true)
  const viaPersonal = await signUp(address, personal.slug)
  expect(viaPersonal.gifted).toBe(false)
  expect(await refusalOf(viaPersonal.user)).toBe('same_ip_pending')
  expect((await signUp(address)).gifted).toBe(false)
})

it('an org with its affiliate switch off gives no partner allowance', async () => {
  const { orgId, slug } = await org(350)
  const address = ip()
  for (let i = 1; i <= 5; i++) expect((await signUp(address)).gifted).toBe(true)
  const user = await createUser(db)
  await db.query('update profiles set signup_ip=$2 where id=$1', [user, address])
  expect(await bind(db, user, slug)).toBe(true)
  await db.query('select admin_org_update($1,$2,$3)', [actor, orgId, { affiliate_enabled: false }])
  expect((await row(db, "select (grant_credits($1::uuid,1,'signup',$2,'free')).applied as ok", [user, 'signup:' + user])).ok).toBe(false)
})

it('the partner allowance is the saved one and never stricter than the site-wide one', async () => {
  const { slug } = await org(0)
  await setSetting('signup_gift_per_ip_partner', 7)
  let address = ip()
  for (let i = 1; i <= 7; i++) expect((await signUp(address, slug)).gifted).toBe(true)
  expect((await signUp(address, slug)).gifted).toBe(false)
  // Lower than the site-wide 5: the site-wide one stands.
  await setSetting('signup_gift_per_ip_partner', 2)
  address = ip()
  for (let i = 1; i <= 5; i++) expect((await signUp(address, slug)).gifted).toBe(true)
  // 0 on either side: no limit.
  await setSetting('signup_gift_per_ip_partner', 0)
  expect((await signUp(address, slug)).gifted).toBe(true)
  expect((await signUp(address)).gifted).toBe(false)
})

it('the daily cap and the pause still apply to an org ?ref sign-up', async () => {
  const { slug } = await org(350)
  await setSetting('signup_gift_paused', true)
  const paused = await signUp(ip(), slug)
  expect(paused.gifted).toBe(false)
  expect(await refusalOf(paused.user)).toBe('paused')
  expect(await bonusOf(paused.user)).toEqual([])
  await setSetting('signup_gift_paused', false)
  await setSetting('signup_gift_daily_cap', 0)
  const capped = await signUp(ip(), slug)
  expect(capped.gifted).toBe(false)
  expect(await refusalOf(capped.user)).toBe('daily_cap')
})

it('admins save signup_gift_per_ip_partner from 0 to 1000; signup_gift_today reports it', async () => {
  expect(await row(db, "select signup_gift_today()->'per_ip_partner' as v")).toEqual({ v: 20 })
  for (const v of [0, 1000]) await db.query("select admin_set_system_setting('signup_gift_per_ip_partner',$1::jsonb,$2)", [JSON.stringify(v), actor])
  expect(await row(db, "select signup_gift_today()->'per_ip_partner' as v")).toEqual({ v: 1000 })
  for (const bad of [1001, -1, 1.5, '"20"', true]) {
    await db.query('savepoint bad')
    await expect(db.query("select admin_set_system_setting('signup_gift_per_ip_partner',$1::jsonb,$2)", [JSON.stringify(bad), actor])).rejects.toThrow('INVALID_INPUT')
    await db.query('rollback to savepoint bad')
  }
  const user = await createUser(db)
  await db.query('savepoint na')
  await expect(db.query("select admin_set_system_setting('signup_gift_per_ip_partner','20'::jsonb,$1)", [user])).rejects.toThrow('NOT_ADMIN')
  await db.query('rollback to savepoint na')
  await db.query('update profiles set banned_at=now() where id=$1', [actor])
  await expect(db.query("select admin_set_system_setting('signup_gift_per_ip_partner','20'::jsonb,$1)", [actor])).rejects.toThrow('NOT_ADMIN')
})
