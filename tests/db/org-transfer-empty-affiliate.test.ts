import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bind, promoter, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import { transferKit } from './org-transfer-fixtures'

// admin_org_transfer_owner with a new owner who has a personal affiliate row (1990, Owner
// 2026-11-23): an empty row (no money, customer, team, rate, pending retry or ban) is deleted in
// the transfer and named in its audit row; a row with any history is refused with
// ORG_NEW_OWNER_AFFILIATE_HISTORY and nothing changes. Each test runs in a rolled-back transaction.

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

async function refused(run: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(run()).rejects.toThrow(new RegExp(`^${message}$`))
  await db.query('rollback to savepoint refused')
}

const { createOrg, transfer, owners, channelOrg } = transferKit(() => db, () => actor)

const affiliateRow = (user: string) => row(db, 'select user_id,slug,status,org_id from affiliates where user_id=$1', [user])
const count = async (sql: string, args: unknown[]) => Number((await row(db, sql, args)).n)

// The production case: a fresh account the admin once gave a personal row, now suspended, whose
// link was opened twice the same day.
async function emptyPersonal(status = 'suspended') {
  const user = await createUser(db)
  const slug = 'qa-' + user.slice(0, 12)
  await db.query(`insert into affiliates(user_id,slug,status,application,approved_at,approved_by,admin_label)
    values($1,$2,$3,'{}',now(),$4,'QA label')`, [user, slug, status, actor])
  await db.query("insert into affiliate_click_days(affiliate_user_id,day,clicks) values($1,'2026-11-20',2)", [user])
  return { user, slug }
}

describe('an empty personal affiliate account of the new owner', () => {
  it('is deleted and the org moves to them with its slug, customers and payouts', async () => {
    const { owner, orgId, customer, ownersCustomer } = await channelOrg()
    const orgSlug = (await affiliateRow(owner)).slug
    const { user, slug } = await emptyPersonal()

    const result = await transfer(orgId, user)
    expect(result).toMatchObject({
      applied: true, previous_owner: owner,
      affiliate: { commissions: 1, payouts: 1, adjustments: 1, customers: 2 },
      removed_personal: { slug, status: 'suspended', clicks: 2 },
    })
    // The org's account now sits on the new owner's key; their personal row and clicks are gone.
    expect(await affiliateRow(user)).toEqual({ user_id: user, slug: orgSlug, status: 'active', org_id: orgId })
    expect(await count('select count(*) as n from affiliates where slug=$1', [slug])).toBe(0)
    expect(await count("select count(*) as n from affiliate_click_days where affiliate_user_id=$1 and day='2026-11-20' and clicks=2", [user])).toBe(0)
    expect(await count('select count(*) as n from affiliate_payouts where affiliate_user_id=$1', [user])).toBe(1)
    expect(await count('select count(*) as n from affiliate_commissions where affiliate_user_id=$1', [user])).toBe(1)
    for (const c of [customer, ownersCustomer]) {
      expect(await row(db, 'select referred_by from profiles where id=$1', [c])).toEqual({ referred_by: user })
    }
    expect(await owners(orgId)).toEqual([user])

    const audit = await row(db, "select user_id,reason from admin_audit_log where action='org_transfer_owner' and target_id=$1", [orgId])
    expect(audit.user_id).toBe(actor)
    expect(JSON.parse(audit.reason)).toMatchObject({ from: owner, to: user, removed_personal: { slug, status: 'suspended', clicks: 2 } })
  })

  it('is deleted whatever its status short of banned, pending and active included', async () => {
    for (const status of ['pending', 'active', 'rejected']) {
      const { orgId } = await channelOrg()
      const { user, slug } = await emptyPersonal(status)
      expect(await transfer(orgId, user)).toMatchObject({ applied: true, removed_personal: { slug, status } })
    }
  })

  it('is deleted for an org without an account when it is open; a closed one is left alone', async () => {
    const plainOrg = await createOrg(await createUser(db), false)
    const open = await emptyPersonal('active')
    expect(await transfer(plainOrg, open.user)).toMatchObject({ applied: true, affiliate: null, removed_personal: { slug: open.slug } })
    expect(await affiliateRow(open.user)).toBeUndefined()

    const other = await createOrg(await createUser(db), false)
    const closed = await emptyPersonal('suspended')
    expect(await transfer(other, closed.user)).toMatchObject({ applied: true, affiliate: null, removed_personal: null })
    expect(await affiliateRow(closed.user)).toMatchObject({ slug: closed.slug, status: 'suspended' })
  })
})

// Each gives a fresh account's personal row one kind of history.
const histories: Record<string, (user: string) => Promise<void>> = {
  async commission(user) {
    const buyer = await createUser(db)
    expect(await bind(db, buyer, (await affiliateRow(user)).slug)).toBe(true)
    await sale(db, buyer, 'pack_m', 2490)
    expect(await count('select count(*) as n from affiliate_commissions where affiliate_user_id=$1', [user])).toBeGreaterThan(0)
    // Only the commission is left: the customer is unbound.
    await db.query('update profiles set referred_by=null where id=$1', [buyer])
  },
  async 'bound customer'(user) {
    expect(await bind(db, await createUser(db), (await affiliateRow(user)).slug)).toBe(true)
  },
  async payout(user) {
    await db.query("insert into affiliate_payouts(affiliate_user_id,period,amount,status,payout_snapshot) values($1,'2031-04-01',300,'paid','{}')", [user])
  },
  async adjustment(user) {
    await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values($1,$2,-100,'fixture')", [randomUUID(), user])
  },
  async 'rate override'(user) {
    await db.query("insert into affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp) values($1,'pack',2000,700)", [user])
  },
  async 'sub-affiliate'(user) {
    await promoter(db, user)
  },
  async 'pending retry'(user) {
    await db.query("insert into affiliate_recompute_errors(payment_id,error,snapshot) values(-1,'fixture',jsonb_build_object('owner',$1::text,'org',null))", [user])
  },
  async 'resolved retry as parent'(user) {
    await db.query("insert into affiliate_recompute_errors(payment_id,error,snapshot,resolved_at) values(-2,'fixture',jsonb_build_object('owner',gen_random_uuid()::text,'parent',$1::text),now())", [user])
  },
  async banned(user) {
    await db.query("update affiliates set status='banned' where user_id=$1", [user])
  },
}

describe('a personal affiliate account with history', () => {
  for (const [kind, give] of Object.entries(histories)) {
    it(`refuses a row with a ${kind} and changes nothing`, async () => {
      const { owner, orgId } = await channelOrg()
      const { id: user } = await promoter(db)
      await give(user)
      const before = { mine: await affiliateRow(user), org: await affiliateRow(owner) }
      await refused(() => transfer(orgId, user), 'ORG_NEW_OWNER_AFFILIATE_HISTORY')
      expect(await affiliateRow(user)).toEqual(before.mine)
      expect(await affiliateRow(owner)).toEqual(before.org)
      expect(await owners(orgId)).toEqual([owner])
      expect(await count("select count(*) as n from admin_audit_log where action='org_transfer_owner' and target_id=$1", [orgId])).toBe(0)
    })
  }

  it('refuses an open row with history for an org without an account, as before', async () => {
    const plainOrg = await createOrg(await createUser(db), false)
    const { id: user } = await promoter(db)
    await histories.payout!(user)
    await refused(() => transfer(plainOrg, user), 'ORG_PERSONAL_AFFILIATE')
  })
})

describe('the history check and the picker', () => {
  // A new table referencing affiliates(user_id) must be added to the history check (1990) or
  // knowingly treated as non-history like click days; this fails until someone decides.
  it('covers every foreign key that reaches an affiliates row', async () => {
    const { rows } = await db.query(`select c.conrelid::regclass::text as tbl, a.attname as col, c.confdeltype as on_delete
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.confrelid = 'public.affiliates'::regclass order by 1, 2`)
    expect(rows).toEqual([
      { tbl: 'affiliate_adjustments', col: 'affiliate_user_id', on_delete: 'c' },
      { tbl: 'affiliate_click_days', col: 'affiliate_user_id', on_delete: 'c' },
      { tbl: 'affiliate_commissions', col: 'affiliate_user_id', on_delete: 'c' },
      { tbl: 'affiliate_payouts', col: 'affiliate_user_id', on_delete: 'c' },
      { tbl: 'affiliate_rate_overrides', col: 'user_id', on_delete: 'c' },
      { tbl: 'affiliates', col: 'parent_user_id', on_delete: 'n' },
      { tbl: 'profiles', col: 'referred_by', on_delete: 'n' },
    ])
  })

  it('lists only personal rows with history', async () => {
    const { owner } = await channelOrg()
    const empty = await emptyPersonal()
    const used = await promoter(db)
    await histories.payout!(used.id)
    const none = await createUser(db)
    const { rows } = await db.query('select * from admin_org_picker_affiliate_history($1::uuid[]) as id', [[owner, empty.user, used.id, none]])
    expect(rows.map((r) => r.id)).toEqual([used.id])
  })

  it('lets only the service role read the picker list, and nobody call the check directly', async () => {
    const { rows } = await db.query(`select r as role,
        has_function_privilege(r, 'public.admin_org_picker_affiliate_history(uuid[])', 'execute') as picker,
        has_function_privilege(r, 'public._affiliate_has_history(uuid)', 'execute') as check
      from unnest(array['anon','authenticated','service_role']) r order by r`)
    expect(rows).toEqual([
      { role: 'anon', picker: false, check: false },
      { role: 'authenticated', picker: false, check: false },
      { role: 'service_role', picker: true, check: false },
    ])
  })
})
