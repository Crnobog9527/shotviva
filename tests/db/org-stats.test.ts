import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// Monthly performance of an enterprise org, card E5 (ARCHITECTURE §6.5): org_member_stats (owner:
// every member, staff: only their own row) and org_member_customers (owner only, masked). Paid is
// USD cents, pre-tax and net of refunds; months are UTC. Each test runs in a transaction that is
// rolled back, so the shared local database is left as found.

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

const NOV = '2026-11'

async function refused(run: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(run()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

// An org with its affiliate switch on, its owner and two staff.
async function team() {
  const owner = await createUser(db)
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true, affiliate_levels: 2 }])).id as string
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  const staff = await createUser(db)
  const other = await createUser(db)
  for (const user of [staff, other]) await db.query('select org_join($1,$2)', [user, invite_token])
  return { owner, orgId, staff, other }
}

const stats = async (caller: string, orgId: string, period = NOV) =>
  (await db.query('select * from org_member_stats($1,$2,$3)', [caller, orgId, period])).rows as Array<Record<string, string | number>>
const customers = async (owner: string, period = NOV) =>
  (await db.query('select * from org_member_customers($1,$2)', [owner, period])).rows as Array<Record<string, string | number>>
const statOf = async (caller: string, orgId: string, member: string, period = NOV) =>
  (await stats(caller, orgId, period)).find((r) => r.member_user_id === member)

// A customer of `member`, bound to the org account at `at` (level 1, or level 2 through `via`).
async function customerOf(orgId: string, owner: string, member: string, at: string, via: string | null = null) {
  const customer = await createUser(db)
  await db.query(
    "update profiles set referred_by=$1, referred_member=$2, referred_source=$3, referred_via=$4, referred_at=$5 where id=$6",
    [owner, member, via ? 'org_l2' : 'org_l1', via, at, customer],
  )
  expect(orgId).toBeTruthy()
  return customer
}

async function paid(customer: string, amount: number, at: string, tax = 0) {
  const p = await sale(db, customer, 'pack_m', amount, tax)
  await db.query('update payments set created_at=$2 where id=$1', [p.id, at])
  return p
}

describe('who may ask', () => {
  it('gives the owner every member and staff only their own row', async () => {
    const { owner, orgId, staff, other } = await team()
    // The owner first; staff who joined at the same instant fall back to id order.
    const ids = (await stats(owner, orgId)).map((r) => r.member_user_id)
    expect([ids[0], ids.slice(1).sort()]).toEqual([owner, [staff, other].sort()])
    expect((await stats(owner, orgId))[0]).toMatchObject({ member_role: 'owner', member_status: 'active' })
    expect((await stats(staff, orgId)).map((r) => r.member_user_id)).toEqual([staff])
    expect((await stats(other, orgId)).map((r) => r.member_user_id)).toEqual([other])
  })

  it('refuses an outsider, an unknown org, a member who left and a malformed month, saying the same for the first two', async () => {
    const { owner, orgId, staff } = await team()
    const outsider = await createUser(db)
    await refused(() => db.query('select * from org_member_stats($1,$2,$3)', [outsider, orgId, NOV]), 'NOT_ORG_MEMBER')
    await refused(() => db.query('select * from org_member_stats($1,$2,$3)', [owner, '11111111-1111-4111-8111-111111111111', NOV]), 'NOT_ORG_MEMBER')
    // Another org's owner has no business in this org.
    const rival = await team()
    await refused(() => db.query('select * from org_member_stats($1,$2,$3)', [rival.owner, orgId, NOV]), 'NOT_ORG_MEMBER')
    await db.query("select org_remove_member($1,$2,'rm-1')", [owner, staff])
    await refused(() => db.query('select * from org_member_stats($1,$2,$3)', [staff, orgId, NOV]), 'NOT_ORG_MEMBER')
    for (const bad of ['2026-13', '2026-1', '', "2026-11'; --", 'november']) {
      await refused(() => db.query('select * from org_member_stats($1,$2,$3)', [owner, orgId, bad]), 'INVALID_INPUT')
    }
    await refused(() => db.query('select * from org_member_stats($1,$2,null)', [owner, orgId]), 'INVALID_INPUT')
  })

  it('shows the customers to the owner only, and is callable by the service role alone', async () => {
    const { owner, staff } = await team()
    await refused(() => db.query('select * from org_member_customers($1,$2)', [staff, NOV]), 'NOT_ORG_OWNER')
    const outsider = await createUser(db)
    await refused(() => db.query('select * from org_member_customers($1,$2)', [outsider, NOV]), 'NOT_ORG_OWNER')
    await refused(() => db.query('select * from org_member_customers($1,$2)', [owner, '2026-00']), 'INVALID_INPUT')
    const can = async (role: string, fn: string) =>
      (await row(db, 'select has_function_privilege($1,$2,$3) as ok', [role, fn, 'execute'])).ok
    for (const fn of ['public.org_member_stats(uuid,uuid,text)', 'public.org_member_customers(uuid,text)']) {
      expect([await can('anon', fn), await can('authenticated', fn), await can('service_role', fn)]).toEqual([false, false, true])
    }
  })
})

describe('the numbers', () => {
  it('counts allocated and used credits in the month only', async () => {
    const { owner, orgId, staff } = await team()
    await db.query("select admin_org_grant($1,$2)", [actor, { org_id: orgId, request_id: 'g1', credits: 1000 }])
    await db.query("select org_allocate($1,$2,300,'a1')", [owner, staff])
    await db.query("select org_allocate($1,$2,200,'a2')", [owner, staff])
    // The ledger rows were written now; the month asked for decides what is counted.
    const now = (await row(db, "select to_char(now() at time zone 'utc','YYYY-MM') as p")).p as string
    expect(await statOf(owner, orgId, staff, now)).toMatchObject({ allocated: '500', used: '0' })
    expect(await statOf(owner, orgId, staff, '2020-01')).toMatchObject({ allocated: '0' })
    await db.query("insert into org_held_draws(debit_key,org_id,user_id,drawn,restored,created_at) values('d1',$1,$2,120,20,$3),('d2',$1,$2,50,0,'2026-10-31T23:59:59.999Z'),('d3',$1,$2,7,0,'2026-12-01T00:00:00Z')", [orgId, staff, `${NOV}-01T00:00:00Z`])
    expect(await statOf(owner, orgId, staff)).toMatchObject({ used: '100' })
  })

  it('counts level-1 and level-2 sign-ups, paying customers and net pre-tax spend', async () => {
    const { owner, orgId, staff, other } = await team()
    const a = await customerOf(orgId, owner, staff, '2026-11-03T08:00:00Z')
    const b = await customerOf(orgId, owner, staff, '2026-11-04T08:00:00Z')
    await customerOf(orgId, owner, staff, '2026-10-20T08:00:00Z') // signed up last month, never pays
    const c = await customerOf(orgId, owner, staff, '2026-11-05T08:00:00Z', a) // level 2, through a
    await customerOf(orgId, owner, other, '2026-11-06T08:00:00Z')
    await paid(a, 2490, '2026-11-10T00:00:00Z', 190) // base 2300
    await paid(a, 2490, '2026-11-11T00:00:00Z') // 2490
    await paid(b, 2490, '2026-11-12T00:00:00Z')
    await paid(c, 2490, '2026-11-13T00:00:00Z')
    expect(await statOf(owner, orgId, staff)).toMatchObject({
      l1_signups: 2, l1_paying: 2, l1_paid_cents: '7280', l2_signups: 1, l2_paying: 1, l2_paid_cents: '2490',
    })
    expect(await statOf(owner, orgId, other)).toMatchObject({ l1_signups: 1, l1_paying: 0, l1_paid_cents: '0', l2_signups: 0 })
    // Staff see their own figures, and exactly the owner's view of them.
    expect(await statOf(staff, orgId, staff)).toEqual(await statOf(owner, orgId, staff))
    expect((await stats(staff, orgId)).length).toBe(1)
  })

  it('reduces the paid amount by refunds, to nothing for a full refund, and does not count that customer as paying', async () => {
    const { owner, orgId, staff } = await team()
    const half = await customerOf(orgId, owner, staff, '2026-11-02T00:00:00Z')
    const full = await customerOf(orgId, owner, staff, '2026-11-02T00:00:00Z')
    const p1 = await paid(half, 2490, '2026-11-10T00:00:00Z')
    const p2 = await paid(full, 2490, '2026-11-10T00:00:00Z')
    await refund(db, p1.charge, 1245)
    await refund(db, p2.charge, 2490)
    expect(await statOf(owner, orgId, staff)).toMatchObject({ l1_signups: 2, l1_paying: 1, l1_paid_cents: '1245' })
  })

  it('cuts months at UTC midnight, both for sign-ups and for payments', async () => {
    const { owner, orgId, staff } = await team()
    const early = await customerOf(orgId, owner, staff, '2026-10-31T23:59:59.999Z')
    const first = await customerOf(orgId, owner, staff, '2026-11-01T00:00:00Z')
    const last = await customerOf(orgId, owner, staff, '2026-11-30T23:59:59.999Z')
    const next = await customerOf(orgId, owner, staff, '2026-12-01T00:00:00Z')
    await paid(early, 2490, '2026-10-31T23:59:59.999Z')
    await paid(early, 2490, '2026-11-01T00:00:00Z')
    await paid(last, 2490, '2026-11-30T23:59:59.999Z')
    await paid(next, 2490, '2026-12-01T00:00:00Z')
    expect(await statOf(owner, orgId, staff, '2026-10')).toMatchObject({ l1_signups: 1, l1_paying: 1, l1_paid_cents: '2490' })
    expect(await statOf(owner, orgId, staff, NOV)).toMatchObject({ l1_signups: 2, l1_paying: 2, l1_paid_cents: '4980' })
    expect(await statOf(owner, orgId, staff, '2026-12')).toMatchObject({ l1_signups: 1, l1_paying: 1, l1_paid_cents: '2490' })
    expect(first).toBeTruthy()
    // The same instants read in another session time zone give the same months.
    await db.query("set local timezone = 'Asia/Shanghai'")
    expect(await statOf(owner, orgId, staff, NOV)).toMatchObject({ l1_signups: 2, l1_paid_cents: '4980' })
  })

  it('ignores payments made before the binding, non-USD payments and customers who joined the org as staff', async () => {
    const { owner, orgId, staff, other } = await team()
    const late = await customerOf(orgId, owner, staff, '2026-11-15T00:00:00Z')
    await paid(late, 2490, '2026-11-14T00:00:00Z')
    const euro = await customerOf(orgId, owner, staff, '2026-11-02T00:00:00Z')
    const p = await paid(euro, 2490, '2026-11-10T00:00:00Z')
    await db.query("update payments set currency='eur' where id=$1", [p.id])
    const colleague = await customerOf(orgId, owner, staff, '2026-11-02T00:00:00Z')
    await paid(colleague, 2490, '2026-11-10T00:00:00Z')
    expect(await statOf(owner, orgId, staff)).toMatchObject({ l1_signups: 3, l1_paying: 1 })
    const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
    await db.query('select org_join($1,$2)', [colleague, invite_token])
    expect(await statOf(owner, orgId, staff)).toMatchObject({ l1_signups: 2, l1_paying: 0, l1_paid_cents: '0' })
    expect(other).toBeTruthy()
  })

  it('keeps a member who left: his customers and history stay, shown as removed only where there is activity', async () => {
    const { owner, orgId, staff } = await team()
    const c = await customerOf(orgId, owner, staff, '2026-11-02T00:00:00Z')
    await paid(c, 2490, '2026-11-10T00:00:00Z')
    await db.query("select org_remove_member($1,$2,'rm-2')", [owner, staff])
    expect(await statOf(owner, orgId, staff)).toMatchObject({ member_status: 'removed', l1_signups: 1, l1_paying: 1, l1_paid_cents: '2490' })
    // A month he did nothing in is not listed; the active members still are.
    expect(await statOf(owner, orgId, staff, '2026-09')).toBeUndefined()
    expect((await stats(owner, orgId, '2026-09')).map((r) => r.member_status)).toEqual(['active', 'active'])
    expect((await customers(owner)).map((r) => r.member_user_id)).toEqual([staff])
  })

  it('is empty for customers when the org has no affiliate account', async () => {
    const owner = await createUser(db)
    const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Plain ' + owner.slice(0, 8) }])).id as string
    expect(await stats(owner, orgId)).toMatchObject([{ member_user_id: owner, allocated: '0', l1_signups: 0, l1_paid_cents: '0' }])
    expect(await customers(owner)).toEqual([])
  })
})

describe('the customer list', () => {
  it('lists a masked contact, sign-up time and paid amounts, for the customers who signed up or paid in the month', async () => {
    const { owner, orgId, staff } = await team()
    const email = await customerOf(orgId, owner, staff, '2026-11-03T08:00:00Z')
    const phone = await customerOf(orgId, owner, staff, '2026-10-03T08:00:00Z')
    const quiet = await customerOf(orgId, owner, staff, '2026-10-04T08:00:00Z')
    await db.query("update auth.users set email=null, phone='8613812345678' where id=$1", [phone])
    await paid(email, 2490, '2026-11-10T00:00:00Z')
    await paid(phone, 1000, '2026-10-12T00:00:00Z')
    await paid(phone, 2490, '2026-11-12T00:00:00Z')
    const rows = await customers(owner)
    expect(rows.map((r) => r.contact).sort()).toEqual(['138****5678', 't***@example.test'])
    expect(rows.find((r) => r.contact === '138****5678')).toMatchObject({ level: 1, paid_in_period_cents: '2490', paid_total_cents: '3490', member_user_id: staff })
    expect(rows.find((r) => r.contact === 't***@example.test')).toMatchObject({ paid_in_period_cents: '2490', paid_total_cents: '2490' })
    expect(rows.some((r) => r.contact === '' || String(r.contact).includes(quiet))).toBe(false)
    // Nothing but the six columns: no customer id, no commission.
    expect(Object.keys(rows[0]!).sort()).toEqual(['contact', 'level', 'member_user_id', 'paid_in_period_cents', 'paid_total_cents', 'signed_up_at'])
    expect(JSON.stringify(rows)).not.toContain(`t2-${email}`)
  })

  it('reports level 2 customers with their level', async () => {
    const { owner, orgId, staff } = await team()
    const a = await customerOf(orgId, owner, staff, '2026-11-03T08:00:00Z')
    await customerOf(orgId, owner, staff, '2026-11-04T08:00:00Z', a)
    expect((await customers(owner)).map((r) => r.level).sort()).toEqual([1, 2])
  })
})
