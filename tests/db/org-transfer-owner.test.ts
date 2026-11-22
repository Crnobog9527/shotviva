import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { commission, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// admin_org_transfer_owner (1930, ARCHITECTURE §6.5): an admin changes an org's primary admin.
// Everything the org earned stays with the org (Owner 2026-11-22): the enterprise affiliate
// account moves to the new owner with its commissions, payouts, adjustments, customers, rates and
// referral slug; pool, allowances and promo sheets are org-keyed and untouched. Each test runs in
// a transaction that is rolled back.

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
  await expect(run()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

async function createOrg(owner: string, affiliate = true) {
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: affiliate }
  return (await row(db, 'select admin_org_create($1,$2) as id', [actor, input])).id as string
}
async function joinOrg(user: string, orgId: string) {
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
  await db.query('select org_join($1,$2)', [user, invite_token])
}
const updatedAt = async (orgId: string) => (await row(db, 'select updated_at::text as at from orgs where id=$1', [orgId])).at as string
async function transfer(orgId: string, user: string, opts: { as?: string; expected?: string } = {}) {
  const input = { org_id: orgId, user_id: user, expected_updated_at: opts.expected ?? (await updatedAt(orgId)) }
  return (await row(db, 'select admin_org_transfer_owner($1,$2) as r', [opts.as ?? actor, input])).r
}
const role = async (orgId: string, user: string) =>
  row(db, 'select role,status,monthly_allowance,held_credits from org_members where org_id=$1 and user_id=$2', [orgId, user])
const owners = async (orgId: string) =>
  (await db.query("select user_id from org_members where org_id=$1 and role='owner' and status='active'", [orgId])).rows.map((r) => r.user_id)

// A new account that signs up with `inviter`'s personal invite code (T94); for an org member
// it becomes the org's level-1 customer.
async function invitedBy(inviter: string) {
  const customer = await createUser(db)
  await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
  const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
  await db.query("select redeem_code($1,$2,'signup',null,$3)", [customer, code, invite.windowDays])
  return customer
}

// An org with the affiliate switch on, a member, one customer each for the owner and the member,
// a payment, an adjustment, a payout, a rate override and a promo sheet.
async function channelOrg() {
  const owner = await createUser(db)
  const orgId = await createOrg(owner)
  const staff = await createUser(db)
  await joinOrg(staff, orgId)
  const customer = await invitedBy(staff)
  const ownersCustomer = await invitedBy(owner)
  await db.query("update affiliates set payout_method='bank',payout_details='company account',admin_note='kept' where user_id=$1", [owner])
  await db.query("insert into affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp) values($1,'pack',2000,700)", [owner])
  const paid = await sale(db, customer, 'pack_m', 2490)
  await db.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,500,'fixture')", [owner])
  await db.query("insert into affiliate_payouts(affiliate_user_id,period,amount,status,payout_snapshot) values($1,'2031-04-01',300,'paid','{}')", [owner])
  await db.query(`insert into partner_promo_grants(org_id,period,status,recipient_user_id,base,bonus,raw_credits,counted_credits,customer_cap,
      customers,capped_customers,clawback_owed,clawback_applied,total,fingerprint,expires_at,decided_at,decided_by)
    values($1,'2031-05','granted',$2,10000,0,0,0,0,0,0,0,0,10000,repeat('a',32),'2031-06-01',now(),$3)`, [orgId, owner, actor])
  await db.query('update org_members set monthly_allowance=40,held_credits=0 where org_id=$1 and user_id=$2', [orgId, staff])
  return { owner, orgId, staff, customer, ownersCustomer, paid }
}

const account = (user: string) =>
  row(db, 'select slug,status,org_id,payout_method,payout_details,admin_note from affiliates where user_id=$1', [user])
const balance = (user: string) =>
  row(db, 'select available::int,pending::int from affiliate_balances where affiliate_user_id=$1', [user])
const keyedTo = async (table: string, column: string, user: string) =>
  Number((await row(db, `select count(*) as n from ${table} where ${column}=$1`, [user])).n)

describe('moving the org to a new primary admin', () => {
  it('keeps every channel asset with the org and gives it to the new owner', async () => {
    const { owner, orgId, staff, customer, ownersCustomer, paid } = await channelOrg()
    const before = { account: await account(owner), balance: await balance(owner), commission: await commission(db, paid.id) }
    const pool = await row(db, 'select pool_credits::int,invite_token,ref_code from orgs where id=$1', [orgId])
    const grant = await row(db, 'select id,org_id,status,total from partner_promo_grants where org_id=$1', [orgId])

    const result = await transfer(orgId, staff)
    expect(result).toMatchObject({ applied: true, previous_owner: owner, affiliate: { commissions: 1, payouts: 1, adjustments: 1, customers: 2 } })

    // The same account (slug = referral link, payout account, notes) now under the new owner.
    expect(await account(staff)).toEqual(before.account)
    expect(await account(owner)).toBeUndefined()
    expect(await balance(staff)).toEqual(before.balance)
    expect(await commission(db, paid.id)).toEqual(before.commission)
    for (const [table, column] of [['affiliate_commissions', 'affiliate_user_id'], ['affiliate_payouts', 'affiliate_user_id'],
      ['affiliate_adjustments', 'affiliate_user_id'], ['affiliate_rate_overrides', 'user_id'], ['profiles', 'referred_by']] as const) {
      expect(await keyedTo(table, column, owner)).toBe(0)
    }
    // Customers stay bound to the org; who invited them is history and does not change.
    expect(await row(db, 'select referred_by,referred_source,referred_member from profiles where id=$1', [customer]))
      .toEqual({ referred_by: staff, referred_source: 'org_l1', referred_member: staff })
    expect(await row(db, 'select referred_by,referred_member from profiles where id=$1', [ownersCustomer]))
      .toEqual({ referred_by: staff, referred_member: owner })

    // Org-keyed things are untouched.
    expect(await row(db, 'select pool_credits::int,invite_token,ref_code from orgs where id=$1', [orgId])).toEqual(pool)
    expect(await row(db, 'select id,org_id,status,total from partner_promo_grants where org_id=$1', [orgId])).toEqual(grant)
    expect(await row(db, 'select owner_user_id from orgs where id=$1', [orgId])).toEqual({ owner_user_id: staff })
    expect(await owners(orgId)).toEqual([staff])
    expect(await role(orgId, staff)).toEqual({ role: 'owner', status: 'active', monthly_allowance: 40, held_credits: 0 })
    expect(await role(orgId, owner)).toMatchObject({ role: 'member', status: 'active' })

    // New sales and refunds of old ones run on the moved account at the org's rate.
    const next = await sale(db, customer, 'pack_m', 2490)
    expect(await row(db, 'select affiliate_user_id,rate_bp from affiliate_commissions where payment_id=$1', [next.id]))
      .toEqual({ affiliate_user_id: staff, rate_bp: 2000 })
    await refund(db, paid.charge, 2490)
    expect(await row(db, 'select affiliate_user_id,status from affiliate_commissions where payment_id=$1', [paid.id]))
      .toEqual({ affiliate_user_id: staff, status: 'void' })

    const audit = await row(db, "select user_id,reason from admin_audit_log where action='org_transfer_owner' and target_id=$1", [orgId])
    expect(audit.user_id).toBe(actor)
    expect(JSON.parse(audit.reason)).toMatchObject({ from: owner, to: staff, affiliate: { commissions: 1, customers: 2 } })
  })

  it('takes the owner powers from the old owner and gives them to the new one', async () => {
    const { owner, orgId, staff } = await channelOrg()
    await transfer(orgId, staff)
    await refused(() => db.query('select org_set_allowance($1,$2,10)', [owner, staff]), 'NOT_ORG_OWNER')
    await db.query('select org_set_allowance($1,$2,10)', [staff, owner])
    // The old owner is a normal member now: the new owner can remove them, and they can leave.
    await db.query("select org_remove_member($1,$2,'rm:transfer-test')", [staff, owner])
    expect((await role(orgId, owner)).status).toBe('removed')
    await refused(() => db.query("select org_leave($1,'leave:transfer-test')", [staff]), 'ORG_OWNER_CANNOT_LEAVE')
  })

  it('accepts an account outside any org, and a removed member, starting them clean', async () => {
    const owner = await createUser(db)
    const orgId = await createOrg(owner)
    const outsider = await createUser(db)
    expect(await transfer(orgId, outsider)).toMatchObject({ applied: true, affiliate: { commissions: 0, customers: 0 } })
    expect(await role(orgId, outsider)).toEqual({ role: 'owner', status: 'active', monthly_allowance: 0, held_credits: 0 })
    expect((await account(outsider)).org_id).toBe(orgId)

    await db.query("select org_remove_member($1,$2,'rm:back')", [outsider, owner])
    expect(await transfer(orgId, owner)).toMatchObject({ applied: true })
    expect(await role(orgId, owner)).toMatchObject({ role: 'owner', status: 'active' })
    expect(await owners(orgId)).toEqual([owner])
  })

  it('moves nothing for an org without an affiliate account; turning it on later opens it for the new owner', async () => {
    const owner = await createUser(db)
    const orgId = await createOrg(owner, false)
    const next = await createUser(db)
    expect(await transfer(orgId, next)).toMatchObject({ applied: true, affiliate: null })
    await db.query('select admin_org_update($1,$2,$3)', [actor, orgId, { affiliate_enabled: true }])
    expect(await account(next)).toMatchObject({ status: 'active', org_id: orgId })
    expect(await account(owner)).toBeUndefined()
  })

  it('does nothing on a repeat, even from a stale form', async () => {
    const { orgId, staff } = await channelOrg()
    const seen = await updatedAt(orgId)
    await transfer(orgId, staff, { expected: seen })
    expect(await transfer(orgId, staff, { expected: seen })).toEqual({ applied: false })
    expect(Number((await row(db, "select count(*) n from admin_audit_log where action='org_transfer_owner' and target_id=$1", [orgId])).n)).toBe(1)
  })
})

describe('refusals', () => {
  it('refuses a non-admin, a banned admin and malformed input', async () => {
    const { orgId, staff } = await channelOrg()
    const plain = await createUser(db)
    await refused(() => transfer(orgId, staff, { as: plain }), 'NOT_ADMIN')
    await db.query('update profiles set banned_at=now() where id=$1', [actor])
    await refused(() => transfer(orgId, staff), 'NOT_ADMIN')
    await db.query('update profiles set banned_at=null where id=$1', [actor])
    await refused(() => db.query('select admin_org_transfer_owner($1,$2)', [actor, { org_id: orgId, user_id: staff }]), 'INVALID_INPUT')
    await refused(() => db.query('select admin_org_transfer_owner($1,$2)', [actor, { org_id: orgId, user_id: 'x', expected_updated_at: 'x' }]), 'INVALID_INPUT')
    await refused(() => transfer('00000000-0000-4000-8000-000000000000', staff, { expected: '2026-01-01T00:00:00Z' }), 'ORG_NOT_FOUND')
  })

  it('refuses a stale form, a missing, banned or other-org account, and an owner of another org', async () => {
    const { owner, orgId, staff } = await channelOrg()
    await refused(() => transfer(orgId, staff, { expected: '2000-01-01T00:00:00Z' }), 'ORG_CHANGED')
    await refused(() => transfer(orgId, '00000000-0000-4000-8000-000000000001'), 'PROFILE_NOT_FOUND')
    const banned = await createUser(db)
    await db.query('update profiles set banned_at=now() where id=$1', [banned])
    await refused(() => transfer(orgId, banned), 'USER_BANNED')
    const otherOwner = await createUser(db)
    const otherOrg = await createOrg(otherOwner, false)
    const otherMember = await createUser(db)
    await joinOrg(otherMember, otherOrg)
    await refused(() => transfer(orgId, otherMember), 'ORG_MEMBER_EXISTS')
    await refused(() => transfer(orgId, otherOwner), 'ORG_MEMBER_EXISTS')
    expect(await row(db, 'select owner_user_id from orgs where id=$1', [orgId])).toEqual({ owner_user_id: owner })
    expect(await account(owner)).toMatchObject({ org_id: orgId })
  })

  it('refuses a new owner with an affiliate row of their own, and an open personal account', async () => {
    const { orgId } = await channelOrg()
    const closed = await createUser(db)
    await db.query("insert into affiliates(user_id,slug,status) values($1,$2,'rejected')", [closed, 'qa-' + closed.slice(0, 12)])
    await refused(() => transfer(orgId, closed), 'ORG_NEW_OWNER_AFFILIATE')

    const plainOrg = await createOrg(await createUser(db), false)
    const open = await createUser(db)
    await db.query("insert into affiliates(user_id,slug,status) values($1,$2,'active')", [open, 'qa-' + open.slice(0, 12)])
    await refused(() => transfer(plainOrg, open), 'ORG_PERSONAL_AFFILIATE')
    // A closed personal row is fine when there is no org account to collide with.
    expect(await transfer(plainOrg, closed)).toMatchObject({ applied: true, affiliate: null })
  })

  it('is callable by the service role only', async () => {
    const { rows } = await db.query(`select r as role, has_function_privilege(r, 'public.admin_org_transfer_owner(uuid,jsonb)', 'execute') as can
      from unnest(array['anon','authenticated','service_role']) r order by r`)
    expect(rows).toEqual([{ role: 'anon', can: false }, { role: 'authenticated', can: false }, { role: 'service_role', can: true }])
  })
})
