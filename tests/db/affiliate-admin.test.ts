import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { available, bind, promoter, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

let db: Client
let admin: string
let user: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  admin = await createUser(db)
  user = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [admin])
  await db.query('update affiliate_settings set enabled=true')
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function rejects(operation: () => Promise<unknown>, reason: string) {
  await db.query('savepoint expected_error')
  await expect(operation()).rejects.toThrow(reason)
  await db.query('rollback to expected_error')
}

const settings = (input: object) => db.query('select admin_affiliate_settings($1,$2)', [admin, input])
const eligible = async () => (await row(db, 'select affiliate_can_apply($1) ok', [user])).ok
const profile = () => row(db, 'select status,approved_at,approved_by,parent_user_id,terms_version,payout_method from affiliates where user_id=$1', [user])

it('checks membership purchase tier and refunds, captures the accepted version, and validates team invitations', async () => {
  const form = { name: 'QA', country: 'US', channel: 'https://example.test', audience: '100', plan: 'Reviews' }
  const leader = await promoter(db)
  const apply = (version: string) => db.query('select affiliate_apply($1,$2,$3,$4)', [user, form, leader.slug, version])
  await settings({ apply_min_level: 'any_paid', terms_version: '2026-11' })
  await sale(db, user, 'pack_m', 2490)
  expect(await eligible()).toBe(false)
  await rejects(() => apply('2026-11'), 'AFFILIATE_INELIGIBLE')
  const purchase = await sale(db, user, 'starter_monthly', 1990)
  expect(await eligible()).toBe(true)
  await settings({ apply_min_level: 'pro' })
  expect(await eligible()).toBe(false)
  await refund(db, purchase.charge, 1990)
  await settings({ apply_min_level: 'starter' })
  expect(await eligible()).toBe(false)
  await sale(db, user, 'pro_yearly', 47900)
  await rejects(() => apply('superseded'), 'AFFILIATE_TERMS_CHANGED')
  await apply('2026-11')
  expect(await profile()).toMatchObject({ status: 'pending', parent_user_id: null, terms_version: '2026-11' })
  await db.query('select admin_affiliate_decide($1,$2)', [admin, { user_id: user, status: 'active', slug: 'qa-accepted' }])
  await settings({ terms_version: '2027-01', apply_min_level: 'none' })
  const save = (v: string) => db.query("select affiliate_save_profile($1,'paypal','QA',false,$2)", [user, v])
  await rejects(() => save('2026-11'), 'AFFILIATE_TERMS_CHANGED')
  await save('2027-01')
  expect(await profile()).toMatchObject({ status: 'active', payout_method: 'paypal', terms_version: '2027-01' })
  await db.query('select admin_affiliate_set($1,$2)', [admin, { user_id: leader.id, team_enabled: true }])
  const member = await createUser(db)
  await db.query('select affiliate_apply($1,$2,$3,$4)', [member, form, leader.slug, '2027-01'])
  expect((await row(db, 'select parent_user_id from affiliates where user_id=$1', [member])).parent_user_id).toBe(leader.id)
})

it('refuses payout detail changes after suspension in the database write', async () => {
  const partner = await promoter(db)
  await settings({ terms_version: 'qa' })
  const save = (details: string) => db.query("select affiliate_save_profile($1,'paypal',$2,false,'qa')", [partner.id, details])
  await save('original')
  await db.query('select admin_affiliate_set($1,$2)', [admin, { user_id: partner.id, status: 'suspended', reason: 'QA' }])
  await rejects(() => save('replacement'), 'AFFILIATE_NOT_FOUND')
  expect(await row(db, 'select status,payout_details from affiliates where user_id=$1', [partner.id]))
    .toMatchObject({ status: 'suspended', payout_details: 'original' })
})

it('only maintains payout details with a dated acceptance of the current version', async () => {
  const partner = await promoter(db)
  await settings({ terms_version: 'v1' })
  const save = (details: string) => db.query("select affiliate_save_profile($1,'wise',$2,false,null)", [partner.id, details])
  const read = () => row(db, 'select payout_details,terms_version,terms_accepted_at::text from affiliates where user_id=$1', [partner.id])
  await rejects(() => save('new account'), 'AFFILIATE_NOT_FOUND')
  expect(await read()).toMatchObject({ terms_version: null, terms_accepted_at: null, payout_details: null })

  await db.query("update affiliates set terms_version='v1' where user_id=$1", [partner.id])
  await rejects(() => save('undated'), 'AFFILIATE_NOT_FOUND')
  expect((await read()).terms_accepted_at).toBeNull()
  await db.query("update affiliates set terms_accepted_at='2025-01-01T00:00Z' where user_id=$1", [partner.id])
  const before = await read()
  await save('changed')
  expect(await read()).toEqual({ ...before, payout_details: 'changed' })

  await settings({ terms_version: 'v2' })
  await rejects(() => save('stale consent'), 'AFFILIATE_NOT_FOUND')
  expect(await read()).toEqual({ ...before, payout_details: 'changed' })
})

it('activates a reserved admin invite only after Auth confirms that email', async () => {
  await db.query('update auth.users set invited_at=now() where id=$1', [user])
  const slug = 'qa-invited'
  await db.query('select admin_affiliate_create($1,$2)', [admin, { user_id: user, slug }])
  expect(await profile()).toMatchObject({ status: 'pending', approved_at: null, approved_by: admin })
  const buyer = await createUser(db)
  expect(await bind(db, buyer, slug)).toBe(false)
  await rejects(() => db.query('select admin_affiliate_decide($1,$2)', [admin, { user_id: user, status: 'active' }]), 'NOT_PENDING')
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [user])
  expect(await profile()).toMatchObject({ status: 'active', approved_at: expect.any(Date), approved_by: admin })
  expect(await bind(db, buyer, slug)).toBe(true)
})

it('repairs only pending admin invites when upgrading historical approval dates', async () => {
  const pending = await promoter(db)
  const active = await promoter(db)
  const ordinary = await promoter(db)
  await db.query(`update affiliates set approved_at='2025-01-01', status=case when user_id=$2 then 'active' else 'pending' end,
    application=case when user_id=$3 then '{}'::jsonb else '{"source":"admin_invite"}'::jsonb end
    where user_id=any($1::uuid[])`, [[pending.id, active.id, ordinary.id], active.id, ordinary.id])
  const sql = await readFile(new URL('../../supabase/migrations/1043_affiliate_invite_approval.sql', import.meta.url), 'utf8')
  await db.query(sql)
  const repaired = await db.query('select user_id from affiliates where user_id=any($1::uuid[]) and approved_at is null',
    [[pending.id, active.id, ordinary.id]])
  expect(repaired.rows).toEqual([{ user_id: pending.id }])
})

it('stops an approval-date repair if a pending admin invite has unexpected application data', async () => {
  const invite = await promoter(db)
  await db.query(`update affiliates set status='pending',approved_at='2025-01-01',
    application='{"source":"admin_invite","name":"Unexpected"}' where user_id=$1`, [invite.id])
  const sql = await readFile(new URL('../../supabase/migrations/1043_affiliate_invite_approval.sql', import.meta.url), 'utf8')
  await rejects(() => db.query(sql), 'AFFILIATE_UNEXPECTED_PENDING_INVITE_APPLICATION')
  expect((await row(db, 'select approved_at is not null unchanged from affiliates where user_id=$1', [invite.id])).unchanged).toBe(true)
})

it('dates an immediately active admin enrollment at creation', async () => {
  await db.query('select admin_affiliate_create($1,$2)', [admin, { user_id: user, slug: 'qa-direct' }])
  expect(await profile()).toMatchObject({ status: 'active', approved_at: expect.any(Date), approved_by: admin })
})

it('consumes a one-time admin grant only after a valid reapplication and retains the rejection audit', async () => {
  await settings({ terms_version: 'qa-v1', apply_min_level: 'none' })
  const team = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [team.id])
  const form = { name: 'Original', country: 'US', channel: 'blog', audience: '100', plan: 'Reviews' }
  const apply = (data: object, parent: string | null = null, version = 'qa-v1') =>
    db.query('select affiliate_apply($1,$2,$3,$4)', [user, data, parent, version])
  const grant = (actor: string) => db.query('select admin_affiliate_allow_reapply($1,$2)', [actor, { user_id: user }])
  const state = () => row(db, 'select status,slug,parent_user_id,application,reject_reason,reapply_allowed,terms_version from affiliates where user_id=$1', [user])
  await apply(form, team.slug)
  const original = await state()
  await rejects(() => grant(admin), 'NOT_REJECTED')
  await db.query('select admin_affiliate_decide($1,$2)', [admin, { user_id: user, status: 'rejected', reason: 'Missing channel URL' }])
  const revised = { ...form, name: 'Revised', country: 'CA', channel: 'https://example.test' }
  await rejects(() => apply({ ...revised, reapply_allowed: true }), 'APPLICATION_EXISTS')
  await rejects(() => grant(user), 'NOT_ADMIN')
  await grant(admin)
  await settings({ terms_version: 'qa-v2' })
  await rejects(() => apply(revised), 'TERMS_CHANGED')
  expect(await state()).toMatchObject({ status: 'rejected', application: form, reject_reason: 'Missing channel URL', reapply_allowed: true })
  await apply({ ...revised, source: 'admin_invite' }, null, 'qa-v2')
  expect(await state()).toEqual({
    status: 'pending', slug: original.slug, parent_user_id: team.id, application: revised,
    reject_reason: null, reapply_allowed: false, terms_version: 'qa-v2',
  })
  await rejects(() => apply(form, null, 'qa-v2'), 'APPLICATION_EXISTS')
  const log = await db.query("select reason from admin_audit_log where action='affiliate_decide' and user_id=$1 and target_id=$2 order by id", [admin, user])
  expect(log.rows.map((event) => event.reason)).toEqual(['Missing channel URL', 'allow_reapply: Missing channel URL'])
})

it('deduplicates adjustment retries, rejects conflicting payloads, and audits the effective write', async () => {
  const affiliate = await promoter(db)
  const payload = { user_id: affiliate.id, amount: 1234, reason: 'bonus', request_id: randomUUID() }
  const adjust = (amount: number) => db.query('select admin_affiliate_adjust($1,$2)', [admin, { ...payload, amount }])
  await adjust(1234)
  await adjust(1234)
  await rejects(() => adjust(5678), 'IDEMPOTENCY_CONFLICT')
  expect(await available(db, affiliate.id)).toBe(1234)
  expect((await row(db, "select count(*)::int n from admin_audit_log where action='affiliate_adjust' and user_id=$1", [admin])).n).toBe(1)
})

it('restricts every RPC and private table; service-role helpers cannot bypass audited functions', async () => {
  const functions = await db.query(`select p.proname,
    has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('authenticated',p.oid,'execute') authenticated,
    has_function_privilege('service_role',p.oid,'execute') service
    from pg_proc p where p.pronamespace='public'::regnamespace and p.proname ~ '^(_affiliate_|affiliate_|admin_affiliate_)'`)
  expect(functions.rows.length).toBeGreaterThan(18)
  for (const fn of functions.rows) {
    expect(fn.anon, fn.proname).toBe(false)
    expect(fn.authenticated, fn.proname).toBe(false)
    expect(fn.service, fn.proname).toBe(!fn.proname.startsWith('_'))
  }
  const tables = await db.query(`select relname,relkind,relrowsecurity,has_table_privilege('anon',oid,'select') anon,
    has_table_privilege('authenticated',oid,'select') authenticated,has_table_privilege('service_role',oid,'update') direct_write
    from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') and relname ~ '^affiliate'`)
  for (const table of tables.rows) {
    expect(table).toMatchObject({ anon: false, authenticated: false, direct_write: false })
    if (table.relkind === 'r') expect(table.relrowsecurity).toBe(true)
  }
  await rejects(() => db.query('select admin_affiliate_settings($1,$2)', [user, { enabled: false }]), 'NOT_ADMIN')
  expect((await row(db, 'select enabled from affiliate_settings')).enabled).toBe(true)
})

it('reports only buyers attributed to this partner and keeps raw buyer identities out of referral results', async () => {
  const partner = await promoter(db)
  const unrelated = await promoter(db)
  const otherBuyer = await createUser(db)
  await bind(db, user, partner.slug)
  await bind(db, otherBuyer, unrelated.slug)
  const first = await sale(db, user, 'pack_m', 2490)
  await sale(db, otherBuyer, 'max_yearly', 71300)
  await db.query('select affiliate_count_click($1)', [partner.slug])
  const summary = await row(db, 'select affiliate_partner_summary($1) s', [partner.id])
  expect(summary.s).toMatchObject({ clicks: 1, referred: 1, paidUsers: 1, pending: 373, available: 0, paid: 0 })
  const referrals = (await db.query('select * from affiliate_partner_referrals($1)', [partner.id])).rows
  expect(referrals).toHaveLength(1)
  expect(referrals[0]).toMatchObject({ masked_hash: expect.stringMatching(/^[a-f0-9]{64}$/), payment_count: '1', commission_amount: '373' })
  expect(JSON.stringify(referrals)).not.toContain(user)
  expect(JSON.stringify(referrals)).not.toContain('@')
  await db.query('select admin_affiliate_rebind($1,$2)', [admin, { user_id: user, affiliate_user_id: unrelated.id, reason: 'support correction' }])
  await refund(db, first.charge, 1000)
  expect((await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1', [first.id])).affiliate_user_id).toBe(partner.id)
})

it('uses catalog identity for affiliate eligibility and the monthly commission of a named SKU', async () => {
  const owner = await promoter(db)
  await bind(db, user, owner.slug)
  await settings({ apply_min_level: 'pro' })
  const sku = 'studio_monthly'
  await db.query('insert into products(id,credits,price_usd,active,days) values($1,123,12.34,false,30)', [sku])
  await db.query("insert into admin.catalog_products(product_id,tier,kind) values ($1,'pro','monthly')", [sku])
  expect((await row(db, 'select admin.catalog_membership_rank($1) as rank', [sku])).rank).toBe(3)
  await db.query(`insert into payments(user_id,product_id,channel,stripe_session_id,amount_total,currency,method)
    values($1,$2,'stripe',$3,1234,'usd','card')`, [user, sku, 'cs_' + randomUUID()])
  expect(await eligible()).toBe(true)
  const rate = await row(db, "select l1_bp from affiliate_rates where product_kind='monthly'")
  const earned = await row(db, "select ac.rate_bp from affiliate_commissions ac join payments p on p.id=ac.payment_id where p.user_id=$1", [user])
  expect(earned.rate_bp).toBe(rate.l1_bp)
  await settings({ apply_min_level: 'max' })
  expect(await eligible()).toBe(false)
})
