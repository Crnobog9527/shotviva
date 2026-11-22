import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import {
  adminActor, confirm, confirmedSale, customer, decide, fiveCustomers, freeOf, months, partner, refused, run, sheet,
} from './partner-promo-fixtures'

// Channel partner promotion grants: how a month's sheet is computed (ARCHITECTURE §6.5 渠道商推广积分,
// migrations 1840–1843) and how it is confirmed. Lifecycle (clawback, expiry, pool) is in
// partner-promo-lifecycle.test.ts.
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

it("grants the Owner's example: 300,000 confirmed level-1 credits give 30,000 + the 10,000 base", async () => {
  const { orgId, owner } = await partner(db, actor)
  await fiveCustomers(db, owner, 60000, m.in_previous)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  expect(s).toMatchObject({ status: 'pending', recipient_user_id: owner, base: 10000, bonus: 30000, raw_credits: 300000,
    counted_credits: 300000, customers: 5, capped_customers: 0, clawback_owed: 0, total: 40000 })
  expect(s.detail.per).toHaveLength(5)
  const before = await freeOf(db, owner)
  expect(await confirm(db, actor, s)).toMatchObject({ applied: true, total: 40000 })
  expect(await freeOf(db, owner)).toBe(before + 40000)
  expect(await row(db, "select pool,kind,delta from credit_ledger where idempotency_key=$1", ['partner_promo:' + s.id]))
    .toEqual({ pool: 'free', kind: 'partner_promo', delta: 40000 })
  const audit = await row(db, "select user_id,reason from admin_audit_log where action='partner_promo_confirm' and target_id=$1", [s.id])
  expect(audit.user_id).toBe(actor)
  expect(JSON.parse(audit.reason)).toMatchObject({ org_id: orgId, period: m.current, total: 40000, recipient: owner })
})

it('counts one large customer in full: no per-customer cap (the Owner 2026-11-22)', async () => {
  const { orgId, owner } = await partner(db, actor)
  const whale = await customer(db, owner)
  await confirmedSale(db, whale, 200000, m.in_previous)
  for (let i = 0; i < 4; i++) await confirmedSale(db, await customer(db, owner), 25000, m.in_previous)
  await run(db, m.current)
  // raw 300,000 all counted → bonus 30,000. The old cap column holds the uncapped total.
  const s = await sheet(db, orgId, m.current)
  expect(s).toMatchObject({ raw_credits: 300000, customer_cap: 300000, counted_credits: 300000, capped_customers: 0, bonus: 30000, total: 40000 })
  expect(s.detail.per[0]).toEqual({ customer: whale, raw: 200000, counted: 200000, capped: false })
  expect(s.detail).toMatchObject({ bonus_bp: 1000, customer_cap_bp: 10000, min_customers: 0 })
})

it('pays the bonus with fewer than 3 paying customers, even a single one', async () => {
  const { orgId, owner } = await partner(db, actor)
  const a = await customer(db, owner)
  // Two orders of the same customer are still one customer.
  await confirmedSale(db, a, 100000, m.in_previous)
  await confirmedSale(db, a, 50000, m.in_previous)
  await run(db, m.current)
  expect(await sheet(db, orgId, m.current)).toMatchObject({ customers: 1, raw_credits: 150000, counted_credits: 150000, bonus: 15000, total: 25000 })

  await confirmedSale(db, await customer(db, owner), 100000, m.in_previous)
  await run(db, m.current)
  expect(await sheet(db, orgId, m.current)).toMatchObject({ customers: 2, counted_credits: 250000, bonus: 25000, total: 35000 })
})

it('counts only org_l1 personal purchases confirmed last month: not org_l2, other accounts, other months or enterprise packages', async () => {
  const { orgId, owner } = await partner(db, actor)
  await fiveCustomers(db, owner, 10000, m.in_previous)
  await confirmedSale(db, await customer(db, owner, 'org_l2'), 500000, m.in_previous)
  await confirmedSale(db, await customer(db, owner), 500000, m.in_before) // confirmed two months ago
  const pending = await sale(db, await customer(db, owner), 'pack_m', 2490) // not confirmed yet
  expect(await row(db, 'select status from affiliate_commissions where payment_id=$1', [pending.id])).toEqual({ status: 'pending' })
  // A personal affiliate's customer, and an offline enterprise package into the org pool.
  const other = await createUser(db)
  await db.query("insert into affiliates(user_id,slug,status) values($1,$2,'active')", [other, 'qa-' + other.slice(0, 12)])
  await confirmedSale(db, await customer(db, other, 'signup'), 500000, m.in_previous)
  await db.query('select admin_org_grant($1,$2)', [actor, { org_id: orgId, request_id: 'grant:promo-test', credits: 500000 }])
  await run(db, m.current)
  expect(await sheet(db, orgId, m.current)).toMatchObject({ customers: 5, raw_credits: 50000, bonus: 5000, total: 15000 })
})

it('counts a partial refund before the run pro rata, and a disputed order not at all', async () => {
  const { orgId, owner } = await partner(db, actor)
  const sales = await fiveCustomers(db, owner, 100000, m.in_previous)
  await db.query("select record_payment_issue($1,'refunded',1245)", [sales[0]!.charge]) // half of 2490
  await db.query("update payments set status='disputed' where id=$1", [sales[1]!.id])
  await run(db, m.current)
  // 50,000 + 3 × 100,000 = 350,000, all counted → 35,000.
  expect(await sheet(db, orgId, m.current)).toMatchObject({ customers: 4, raw_credits: 350000, counted_credits: 350000, bonus: 35000 })
})

it('keeps one sheet per partner and month however often it runs; a double confirm grants once', async () => {
  const { orgId, owner } = await partner(db, actor)
  await fiveCustomers(db, owner, 20000, m.in_previous)
  const first = await run(db, m.current)
  expect(first).toMatchObject({ period: m.current, sheets: 1, failed_orgs: [] })
  const s = await sheet(db, orgId, m.current)
  await run(db, m.current)
  expect(await sheet(db, orgId, m.current)).toMatchObject({ id: s.id, fingerprint: s.fingerprint, total: 20000 })
  expect(await row(db, 'select count(*)::int n from partner_promo_grants where org_id=$1', [orgId])).toEqual({ n: 1 })

  const before = await freeOf(db, owner)
  expect(await confirm(db, actor, s)).toMatchObject({ applied: true })
  expect(await confirm(db, actor, s)).toMatchObject({ applied: false, reason: 'already' })
  // A run after the confirm leaves the frozen sheet alone.
  expect(await run(db, m.current)).toMatchObject({ sheets: 0 })
  expect(await freeOf(db, owner)).toBe(before + 20000)
  expect(await row(db, "select count(*)::int n from credit_ledger where kind='partner_promo' and user_id=$1", [owner])).toEqual({ n: 1 })
  expect(await row(db, "select count(*)::int n from admin_audit_log where action='partner_promo_confirm' and target_id=$1", [s.id])).toEqual({ n: 1 })
  await refused(db, () => decide(db, actor, { grant_id: s.id, decision: 'reject', note: 'late' }), 'PROMO_GRANT_DECIDED')
})

it('refuses a stale page: data changed since the sheet was shown → recomputed, nothing granted', async () => {
  const { orgId, owner } = await partner(db, actor)
  await fiveCustomers(db, owner, 20000, m.in_previous)
  await run(db, m.current)
  const shown = await sheet(db, orgId, m.current)
  await confirmedSale(db, await customer(db, owner), 20000, m.in_previous)
  const before = await freeOf(db, owner)
  expect(await confirm(db, actor, shown)).toMatchObject({ applied: false, reason: 'changed', total: 22000 })
  expect(await freeOf(db, owner)).toBe(before)
  const fresh = await sheet(db, orgId, m.current)
  expect(fresh).toMatchObject({ status: 'pending', total: 22000, customers: 6 })
  expect(fresh.fingerprint).not.toBe(shown.fingerprint)
  // The old page again: its fingerprint no longer matches the stored sheet.
  expect(await confirm(db, actor, shown)).toMatchObject({ applied: false, reason: 'changed' })
  expect(await confirm(db, actor, fresh)).toMatchObject({ applied: true, total: 22000 })
})

it('rejects with a note, refuses non-admins, bad input and partners without an affiliate account', async () => {
  const { orgId, owner } = await partner(db, actor)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  expect(s).toMatchObject({ customers: 0, bonus: 0, total: 10000 })
  await refused(db, () => decide(db, actor, { grant_id: s.id, decision: 'reject' }), 'INVALID_INPUT')
  await refused(db, () => decide(db, actor, { grant_id: s.id, decision: 'send' }), 'INVALID_INPUT')
  await refused(db, async () => decide(db, await createUser(db), { grant_id: s.id, decision: 'confirm', fingerprint: s.fingerprint }), 'NOT_ADMIN')
  expect(await decide(db, actor, { grant_id: s.id, decision: 'reject', note: 'wrong partner' })).toMatchObject({ applied: true })
  expect(await decide(db, actor, { grant_id: s.id, decision: 'reject', note: 'again' })).toMatchObject({ applied: false, reason: 'already' })
  await refused(db, () => confirm(db, actor, s), 'PROMO_GRANT_DECIDED')
  expect(await freeOf(db, owner)).toBe(0)

  const plain = await createUser(db)
  const noAffiliate = (await row(db, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: plain, name: 'Plain org' }])).id
  await refused(db, () => db.query('select admin_partner_promo_set($1,$2)', [actor, { org_id: noAffiliate, on: true }]), 'PROMO_PARTNER_NEEDS_AFFILIATE')
  // An unmarked partner gets no new sheet, and a pending one can no longer be confirmed.
  const other = await partner(db, actor)
  await run(db, m.current)
  await db.query('select admin_partner_promo_set($1,$2)', [actor, { org_id: other.orgId, on: false }])
  expect(await run(db, m.current)).toMatchObject({ sheets: 0 }) // the marked one is decided, the other unmarked
  const pending = await sheet(db, other.orgId, m.current)
  await refused(db, () => confirm(db, actor, pending), 'PROMO_PARTNER_OFF')
  expect(await row(db, "select count(*)::int n from admin_audit_log where action='partner_promo_set' and target_id=$1", [other.orgId])).toEqual({ n: 2 })
})

it('is callable by the service role only', async () => {
  for (const fn of ['admin_partner_promo_set(uuid,jsonb)', 'admin_partner_promo_decide(uuid,jsonb)', 'admin_partner_promo_run(uuid)', 'partner_promo_run(text)']) {
    expect(await row(db, `select has_function_privilege('anon','public.${fn}','execute') a,
      has_function_privilege('authenticated','public.${fn}','execute') u, has_function_privilege('service_role','public.${fn}','execute') s`))
      .toEqual({ a: false, u: false, s: true })
  }
  for (const fn of ['_partner_promo_calc(uuid,text)', '_partner_promo_store(jsonb)', '_partner_promo_expire()']) {
    expect(await row(db, `select has_function_privilege('service_role','public.${fn}','execute') s`)).toEqual({ s: false })
  }
  for (const table of ['partner_promo_grants', 'partner_promo_grant_lines', 'partner_promo_clawbacks']) {
    expect(await row(db, `select has_table_privilege('authenticated','public.${table}','select') u, has_table_privilege('service_role','public.${table}','insert') i`))
      .toEqual({ u: false, i: false })
  }
})
