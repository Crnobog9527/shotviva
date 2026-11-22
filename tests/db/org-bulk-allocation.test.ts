import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner, refused } from './partner-promo-fixtures'

// Org default allowances and bulk actions (ARCHITECTURE §6.5 「默认额度与批量」, migrations 1898–1899).
let db: Client
let actor: string
let m: Awaited<ReturnType<typeof months>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await adminActor(db)
  m = await months(db)
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const topup = (orgId: string, owner: string, credits: number) =>
  db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits, reason: 't', request_key: randomUUID() }])
const bank = (orgId: string, credits: number) =>
  db.query('select admin_org_grant($1,$2)', [actor, { org_id: orgId, kind: 'bank_grant', credits, request_id: 'bank:' + randomUUID() }])

// A partner org with `n` members who joined in order.
async function org(n: number) {
  const p = await partner(db, actor)
  const members: string[] = []
  for (let i = 0; i < n; i++) {
    const id = await createUser(db)
    await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [id, p.orgId])
    await db.query("update org_members set joined_at=now()+make_interval(secs => $2) where user_id=$1", [id, i + 1])
    members.push(id)
  }
  return { ...p, members }
}
const call = async (fn: string, owner: string, input: object, id = 'form:' + randomUUID()) =>
  (await row(db, `select ${fn}($1,$2,$3) r`, [owner, input, id])).r
const seat = (orgId: string, user: string) =>
  row(db, `select monthly_allowance, promo_allowance, paid_allowance_custom, promo_allowance_custom, held_credits, held_promo_credits
    from org_members where org_id=$1 and user_id=$2`, [orgId, user])
const pools = (orgId: string) => row(db, 'select pool_credits::int paid, promo_pool_credits::int promo from orgs where id=$1', [orgId])

it('applies the org defaults to every member without a personal setting, new joiners included', async () => {
  const { orgId, owner, members: [a, b] } = await org(2)
  await db.query('select org_set_promo_allowance($1,$2,100)', [owner, b]) // b's own setting
  expect(await call('org_set_default_allowances', owner, { paid: 200, promo: 500 })).toMatchObject({ applied: true, default_paid_allowance: 200, default_promo_allowance: 500 })
  await topup(orgId, owner, 5000)
  expect((await seat(orgId, a!)).held_promo_credits).toBe(500)
  expect((await seat(orgId, b!)).held_promo_credits).toBe(100) // personal overrides the default
  const late = await createUser(db)
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [late, orgId])
  await db.query('select org_set_default_allowances($1,$2,$3)', [owner, { promo: 600 }, 'form:' + randomUUID()]) // the next hand-out run
  expect((await seat(orgId, late)).held_promo_credits).toBe(600)
  expect((await seat(orgId, a!)).held_promo_credits).toBe(600)
  // The paid default: the monthly top-up tops a + the owner + late up to 200 (b's paid is 0, so default too).
  await bank(orgId, 10000)
  const r = (await row(db, 'select org_monthly_topup($1) r', [m.current])).r
  expect(r.failed_orgs).toEqual([])
  for (const id of [a!, b!, late, owner]) expect((await seat(orgId, id)).held_credits).toBe(200)
})

it('sets either or both kinds for many members at once, and "use default" clears a personal value', async () => {
  const { orgId, owner, members } = await org(3)
  await call('org_set_default_allowances', owner, { paid: 50, promo: 70 })
  expect(await call('org_bulk_set_allowance', owner, { members, paid: 300, promo: 400 })).toEqual({ applied: true, members: 3 })
  for (const id of members) expect(await seat(orgId, id)).toMatchObject({ monthly_allowance: 300, paid_allowance_custom: true, promo_allowance: 400, promo_allowance_custom: true })
  expect(await call('org_bulk_set_allowance', owner, { members: [members[0]], promo: 'default' })).toEqual({ applied: true, members: 1 })
  expect(await seat(orgId, members[0]!)).toMatchObject({ monthly_allowance: 300, paid_allowance_custom: true, promo_allowance_custom: false })
  expect((await db.query('select promo_allowance from org_member_promo_stats($1,$2,$3) where member_user_id=$4', [owner, orgId, m.current, members[0]])).rows)
    .toEqual([{ promo_allowance: 70 }])
  for (const bad of [{ members }, { members, paid: -1 }, { members, paid: 1.5 }, { members, promo: 'all' }, { members: [], paid: 1 }, { members: [members[0], members[0]], paid: 1 }]) {
    await refused(db, () => call('org_bulk_set_allowance', owner, bad), 'INVALID_INPUT')
  }
})

it('gives everyone selected the same one-off amount, all or nothing, once per request', async () => {
  const { orgId, owner, members } = await org(3)
  await topup(orgId, owner, 1000)
  const id = 'form:' + randomUUID()
  expect(await call('org_bulk_grant', owner, { members, kind: 'promo', each: 300 }, id)).toEqual({ applied: true, members: 3, total: 900, pool_credits: 100 })
  expect(await call('org_bulk_grant', owner, { members, kind: 'promo', each: 300 }, id)).toMatchObject({ applied: false }) // double click
  for (const user of members) expect((await seat(orgId, user)).held_promo_credits).toBe(300)
  expect(await pools(orgId)).toMatchObject({ promo: 100 })
  // Not enough for everyone: nothing at all.
  await refused(db, () => call('org_bulk_grant', owner, { members, kind: 'promo', each: 50 }), 'ORG_POOL_INSUFFICIENT')
  await bank(orgId, 100)
  await refused(db, () => call('org_bulk_grant', owner, { members, kind: 'paid', each: 40 }), 'ORG_POOL_INSUFFICIENT')
  expect(await pools(orgId)).toEqual({ paid: 100, promo: 100 })
  expect(await call('org_bulk_grant', owner, { members, kind: 'paid', each: 30 })).toMatchObject({ applied: true, total: 90, pool_credits: 10 })
  for (const user of members) expect((await seat(orgId, user)).held_credits).toBe(30)
  const audit = await row(db, "select actor, members, total, payload->>'kind' kind from org_bulk_actions where request_id=$1", [id])
  expect(audit).toEqual({ actor: owner, members: 3, total: '900', kind: 'promo' })
})

it('refuses the whole action when one id is not an active member, and refuses non-owners', async () => {
  const { orgId, owner, members } = await org(2)
  await topup(orgId, owner, 1000)
  const stranger = await createUser(db)
  await refused(db, () => call('org_bulk_grant', owner, { members: [...members, stranger], kind: 'promo', each: 10 }), 'ORG_MEMBER_NOT_FOUND')
  expect(await pools(orgId)).toMatchObject({ promo: 1000 })
  await refused(db, () => call('org_bulk_grant', members[0]!, { members, kind: 'promo', each: 10 }), 'NOT_ORG_OWNER')
  await refused(db, () => call('org_bulk_set_allowance', stranger, { members, paid: 1 }), 'NOT_ORG_OWNER')
  await refused(db, () => call('org_set_default_allowances', members[0]!, { paid: 1 }), 'NOT_ORG_OWNER')
  await refused(db, () => call('org_bulk_grant', owner, { members, kind: 'promo', each: 10 }, 'org_promo_topup:x'), 'INVALID_INPUT')
  await db.query("update orgs set status='suspended' where id=$1", [orgId])
  await refused(db, () => call('org_bulk_grant', owner, { members, kind: 'promo', each: 10 }), 'ORG_SUSPENDED')
})

it('starts a rejoining member over on the defaults', async () => {
  const { orgId, owner, members: [a] } = await org(1)
  await db.query('select org_set_promo_allowance($1,$2,900)', [owner, a])
  await db.query('select org_set_allowance($1,$2,900)', [owner, a])
  await db.query("select org_leave($1,'leave-r')", [a])
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [a, orgId])
  expect(await seat(orgId, a!)).toMatchObject({ monthly_allowance: 0, promo_allowance: 0, paid_allowance_custom: null, promo_allowance_custom: null, held_promo_credits: 0 })
})

it('keeps the new functions and table away from clients', async () => {
  for (const fn of ['org_set_default_allowances(uuid,jsonb,text)', 'org_bulk_set_allowance(uuid,jsonb,text)', 'org_bulk_grant(uuid,jsonb,text)']) {
    expect(await row(db, `select has_function_privilege('authenticated','public.${fn}','execute') u, has_function_privilege('anon','public.${fn}','execute') a,
      has_function_privilege('service_role','public.${fn}','execute') s`)).toEqual({ u: false, a: false, s: true })
  }
  for (const fn of ['_org_allowance(boolean,integer,integer)', '_org_bulk_replayed(text,uuid,text)', '_org_bulk_members(uuid,jsonb)', '_org_allowance_input(jsonb)']) {
    expect(await row(db, `select has_function_privilege('service_role','public.${fn}','execute') s`)).toEqual({ s: false })
  }
  expect(await row(db, `select has_table_privilege('authenticated','public.org_bulk_actions','select') u, has_table_privilege('service_role','public.org_bulk_actions','select') s,
    has_table_privilege('service_role','public.org_bulk_actions','insert') w, (select relrowsecurity from pg_class where oid='public.org_bulk_actions'::regclass) r`))
    .toEqual({ u: false, s: true, w: false, r: true })
})
