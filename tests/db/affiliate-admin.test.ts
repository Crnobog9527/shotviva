import { randomUUID } from 'node:crypto'
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
const profile = () => row(db, 'select status,parent_user_id,terms_version,payout_method from affiliates where user_id=$1', [user])

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

it('activates a reserved admin invite only after Auth confirms that email', async () => {
  await db.query('update auth.users set invited_at=now() where id=$1', [user])
  const slug = 'qa-invited'
  await db.query('select admin_affiliate_create($1,$2)', [admin, { user_id: user, slug }])
  expect((await profile()).status).toBe('pending')
  const buyer = await createUser(db)
  expect(await bind(db, buyer, slug)).toBe(false)
  await rejects(() => db.query('select admin_affiliate_decide($1,$2)', [admin, { user_id: user, status: 'active' }]), 'NOT_PENDING')
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [user])
  expect((await profile()).status).toBe('active')
  expect(await bind(db, buyer, slug)).toBe(true)
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
