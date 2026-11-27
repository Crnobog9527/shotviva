import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { bind, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// 推广名单 (2020): admin_org_customers lists every account bound to the org's affiliate account,
// level 1 and 2, newest binding first, with the bonus, spend and commission of each. Each test runs
// in a transaction that is rolled back. Fake data only.

let db: Client
let actor: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function orgTeam() {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])).id as string
  await db.query('select admin_org_update($1,$2,$3)', [actor, orgId, { affiliate_levels: 2 }])
  const { updated_at } = await row(db, 'select updated_at::text from orgs where id=$1', [orgId])
  await db.query('select admin_org_set_signup_bonus($1,$2,$3,$4)', [actor, orgId, 300, updated_at])
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  const staff = await createUser(db)
  await db.query('select org_join($1,$2)', [staff, invite_token])
  const { slug } = await row(db, 'select slug from affiliates where org_id=$1', [orgId])
  return { owner, orgId, staff, slug: slug as string }
}

async function invitedBy(inviter: string) {
  const customer = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  await db.query("select redeem_code($1,$2,'signup',null,$3)", [customer, code, invite.windowDays])
  return customer
}

const list = (orgId: string, limit = 50, offset = 0) =>
  db.query('select * from admin_org_customers($1,$2,$3)', [orgId, limit, offset]).then((r) => r.rows)

it('lists both levels and the partner-link customers, newest binding first, with bonus, spend and commission', async () => {
  const { orgId, staff, slug } = await orgTeam()
  const l1 = await invitedBy(staff)
  await db.query("update profiles set referred_at=now()-interval '3 minutes' where id=$1", [l1])
  const l2 = await invitedBy(l1)
  await db.query("update profiles set referred_at=now()-interval '2 minutes' where id=$1", [l2])
  const viaLink = await createUser(db)
  expect(await bind(db, viaLink, slug)).toBe(true)
  // Someone else's customer is not listed.
  const other = await createUser(db)
  const stranger = await orgTeam()
  await bind(db, other, stranger.slug)

  const { id: payment } = await sale(db, l1, 'pack_m', 2490)
  const { amount } = await row(db, 'select coalesce(sum(amount),0)::int amount from affiliate_commissions where payment_id=$1', [payment])
  expect(amount).toBeGreaterThan(0)

  const rows = await list(orgId)
  expect(rows.map((r) => r.user_id)).toEqual([viaLink, l2, l1])
  expect(rows.every((r) => Number(r.total) === 3 && Number(r.total_l2) === 1)).toBe(true)

  const byId = new Map(rows.map((r) => [r.user_id, r]))
  expect(byId.get(l1)).toMatchObject({ level: 1, source: 'org_l1', member_user_id: staff, via_user_id: null, bonus_credits: 300, bonus_error: null,
    paid_before: false, has_signup_gift: true, paid_cents: '2490', commission_cents: String(amount), promo_credits: '0' })
  expect(byId.get(l1).contact).toMatch(/@/)
  expect(byId.get(l1).member_contact).toMatch(/@/)
  expect(byId.get(l2)).toMatchObject({ level: 2, source: 'org_l2', member_user_id: staff, via_user_id: l1, bonus_credits: null, paid_cents: '0', commission_cents: '0' })
  expect(byId.get(viaLink)).toMatchObject({ level: 1, source: 'signup', member_user_id: null, has_signup_gift: false })
})

it('never lists the org\'s own staff, even one who was its customer first', async () => {
  const { orgId, staff } = await orgTeam()
  const customer = await invitedBy(staff)
  expect((await list(orgId)).map((r) => r.user_id)).toEqual([customer])
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [customer, invite_token])
  expect(await list(orgId)).toEqual([])
})

it('pages with a total, records a bonus error, and returns nothing for an org without an affiliate account', async () => {
  const { orgId, staff } = await orgTeam()
  const a = await invitedBy(staff)
  const b = await invitedBy(staff)
  await db.query("insert into org_signup_bonus_errors(user_id,error) values($1,'blocked_no_signup_grant') on conflict(user_id) do update set error=excluded.error", [b])
  const first = await list(orgId, 1, 0)
  const second = await list(orgId, 1, 1)
  expect(first).toHaveLength(1)
  expect(second).toHaveLength(1)
  expect(Number(first[0].total)).toBe(2)
  expect(new Set([first[0].user_id, second[0].user_id])).toEqual(new Set([a, b]))
  expect((await list(orgId)).find((r) => r.user_id === b).bonus_error).toBe('blocked_no_signup_grant')
  expect(await list(orgId, 50, 5)).toEqual([])

  const owner = await createUser(db)
  const plain = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Plain ' + owner.slice(0, 8) }])).id
  expect(await list(plain)).toEqual([])
})

it('refuses bad paging and every client role', async () => {
  const { orgId } = await orgTeam()
  for (const [limit, offset] of [[0, 0], [201, 0], [10, -1]]) {
    await db.query('savepoint bad')
    await expect(list(orgId, limit, offset)).rejects.toThrow('INVALID_INPUT')
    await db.query('rollback to savepoint bad')
  }
  for (const role of ['anon', 'authenticated']) {
    await db.query('savepoint denied')
    await db.query(`set local role ${role}`)
    await expect(list(orgId)).rejects.toThrow(/permission denied/)
    await db.query('rollback to savepoint denied')
  }
})
