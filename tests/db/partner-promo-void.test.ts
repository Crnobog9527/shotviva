import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, asLegacy, confirm, decide, fiveCustomers, freeOf, months, partner, refused, run, sheet } from './partner-promo-fixtures'

// Voiding a granted monthly promotion sheet whose credits an admin already took back by hand
// (ARCHITECTURE §6.5 渠道商推广积分, migration 1920): the void moves no credits and the month-end
// expiry, its overdue alarm and the owner's month card skip the sheet.
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

type Answer = { applied: boolean; reason?: string; grant_id?: number }
const voidSheet = async (who: string, input: object) =>
  (await row(db, 'select admin_partner_promo_void($1,$2) as r', [who, input])).r as Answer
const expirePass = async () => (await row(db, 'select partner_promo_expire_run() as r')).r
const voidOf = (id: string) =>
  row(db, 'select voided_at is not null as voided, voided_by, void_reason, status, expired_at, expired_credits from partner_promo_grants where id=$1', [id])

// A granted base-only sheet (10,000) for this month, then the production case: an admin took the
// 10,000 back by hand and the owner has 2,510 other free credits.
async function grantedThenTakenBack() {
  const { orgId, owner } = await partner(db, actor)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  expect(await confirm(db, actor, s)).toMatchObject({ applied: true, total: 10000 })
  // Granted the way production's sheet was, before migration 1894: into the owner's own pool.
  await asLegacy(db, 'partner_promo_grants', s.id)
  await db.query("select _apply_credit_change($1,'free','admin_adjust',-10000,'收回推广积分',$2)", [owner, 'adj:' + s.id])
  await db.query("select _apply_credit_change($1,'free','admin_adjust',2510,'other',$2)", [owner, 'adj2:' + s.id])
  return { orgId, owner, s }
}
// Moves the sheet's month into the past (granted a day ago, expired `expired` ago).
const pastMonth = (id: string, expired = '1 minute') =>
  db.query("update partner_promo_grants set decided_at=now()-interval '1 day', expires_at=now()-$2::interval where id=$1", [id, expired])

it('voids a granted sheet without moving credits, and the month-end expiry then skips it', async () => {
  const { orgId, owner, s } = await grantedThenTakenBack()
  expect(await freeOf(db, owner)).toBe(2510)
  expect(await voidSheet(actor, { grant_id: s.id, reason: ' 已手动收回 ' })).toEqual({ applied: true, grant_id: Number(s.id) })
  expect(await freeOf(db, owner)).toBe(2510)
  expect(await voidOf(s.id)).toMatchObject({ voided: true, voided_by: actor, void_reason: '已手动收回', status: 'granted' })
  expect(await row(db, "select target_id as target, reason::jsonb->>'reason' as why from admin_audit_log where action='partner_promo_void' and user_id=$1", [actor]))
    .toEqual({ target: s.id, why: '已手动收回' })
  // The owner's month card no longer counts it.
  expect(await row(db, 'select monthly, remaining from org_promo_month($1)', [orgId])).toEqual({ monthly: 0, remaining: 0 })

  // Two hours past its month: not taken back, not overdue, and the next pass does nothing either.
  await pastMonth(s.id, '2 hours')
  expect(await expirePass()).toMatchObject({ expired: 0, taken: 0, failed: [], overdue: 0 })
  expect(await freeOf(db, owner)).toBe(2510)
  expect(await voidOf(s.id)).toMatchObject({ expired_at: null, expired_credits: null })
  expect(await row(db, "select count(*)::int n from credit_ledger where kind='partner_promo_expire' and user_id=$1", [owner])).toEqual({ n: 0 })
})

it('without the void the same sheet would take the owner\'s other free credits (the case it fixes)', async () => {
  const { owner, s } = await grantedThenTakenBack()
  await pastMonth(s.id)
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 2510 })
  expect(await freeOf(db, owner)).toBe(0)
})

it('leaves a top-up of the same month to expire on its own: the voided sheet absorbs no spending', async () => {
  const { orgId, owner, s } = await grantedThenTakenBack()
  const t = await row(db, 'select admin_partner_promo_topup($1,$2) as r', [actor,
    { org_id: orgId, recipient: owner, period: m.current, credits: 5000, reason: 'extra', request_key: randomUUID() }])
  await asLegacy(db, 'partner_promo_topups', t.r.topup_id)
  await voidSheet(actor, { grant_id: s.id, reason: 'manual' })
  // 3,000 spent during the month, after both: it comes out of the top-up.
  await db.query("select _apply_credit_change($1,'free','reserve',-3000,'job','job:v1:reserve')", [owner])
  await db.query("update credit_ledger set created_at=now()-interval '1 minute' where idempotency_key='job:v1:reserve'")
  await db.query("update partner_promo_topups set created_at=now()-interval '1 day', expires_at=now() where id=$1", [t.r.topup_id])
  await db.query("update partner_promo_grants set decided_at=now()-interval '1 day', expires_at=now() where id=$1", [s.id])
  expect(await freeOf(db, owner)).toBe(2510 + 5000 - 3000)
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 2000, failed: [] })
  expect(await freeOf(db, owner)).toBe(2510)
  expect(await voidOf(s.id)).toMatchObject({ expired_at: null })
})

it('is a no-op the second time and keeps the first reason', async () => {
  const { s } = await grantedThenTakenBack()
  await voidSheet(actor, { grant_id: s.id, reason: 'first' })
  const other = await adminActor(db)
  expect(await voidSheet(other, { grant_id: s.id, reason: 'second' })).toEqual({ applied: false, reason: 'already', grant_id: Number(s.id) })
  expect(await voidOf(s.id)).toMatchObject({ voided_by: actor, void_reason: 'first' })
  expect(await row(db, "select count(*)::int n from admin_audit_log where action='partner_promo_void' and target_id=$1", [s.id])).toEqual({ n: 1 })
})

it('is for admins through the service role only', async () => {
  const { owner, s } = await grantedThenTakenBack()
  await refused(db, async () => voidSheet(await createUser(db), { grant_id: s.id, reason: 'x' }), 'NOT_ADMIN')
  await refused(db, () => voidSheet(owner, { grant_id: s.id, reason: 'x' }), 'NOT_ADMIN')
  expect(await voidOf(s.id)).toMatchObject({ voided: false })
  expect(await row(db, `select has_function_privilege('anon','public.admin_partner_promo_void(uuid,jsonb)','execute') a,
    has_function_privilege('authenticated','public.admin_partner_promo_void(uuid,jsonb)','execute') u,
    has_function_privilege('service_role','public.admin_partner_promo_void(uuid,jsonb)','execute') s`)).toEqual({ a: false, u: false, s: true })
})

it('refuses pending, rejected and lapsed sheets, a sheet already taken back, and a missing reason', async () => {
  const { orgId } = await partner(db, actor)
  await run(db, m.current)
  const pending = await sheet(db, orgId, m.current)
  await refused(db, () => voidSheet(actor, { grant_id: pending.id, reason: 'x' }), 'PROMO_GRANT_NOT_GRANTED')
  await decide(db, actor, { grant_id: pending.id, decision: 'reject', note: 'no' })
  await refused(db, () => voidSheet(actor, { grant_id: pending.id, reason: 'x' }), 'PROMO_GRANT_NOT_GRANTED')

  const late = await partner(db, actor)
  await run(db, m.previous)
  await run(db, m.current) // closes last month's undecided sheet
  const lapsed = await sheet(db, late.orgId, m.previous)
  expect(lapsed.status).toBe('lapsed')
  await refused(db, () => voidSheet(actor, { grant_id: lapsed.id, reason: 'x' }), 'PROMO_GRANT_NOT_GRANTED')

  const { s } = await grantedThenTakenBack()
  for (const bad of [{ grant_id: s.id }, { grant_id: s.id, reason: '  ' }, { grant_id: s.id, reason: 'x'.repeat(501) }, { grant_id: 'x', reason: 'x' }]) {
    await refused(db, () => voidSheet(actor, bad), 'INVALID_INPUT')
  }
  await refused(db, () => voidSheet(actor, { grant_id: '999999999', reason: 'x' }), 'PROMO_GRANT_NOT_FOUND')
  await pastMonth(s.id)
  await expirePass()
  await refused(db, () => voidSheet(actor, { grant_id: s.id, reason: 'x' }), 'PROMO_GRANT_EXPIRED')
  expect(await voidOf(s.id)).toMatchObject({ voided: false })
})

it('can still void after the month ended while the expiry pass has not run yet', async () => {
  const { owner, s } = await grantedThenTakenBack()
  await pastMonth(s.id)
  expect(await voidSheet(actor, { grant_id: s.id, reason: 'late' })).toMatchObject({ applied: true })
  expect(await expirePass()).toMatchObject({ taken: 0 })
  expect(await freeOf(db, owner)).toBe(2510)
})

it('takes no clawback from later months for a voided sheet whose bonus was already taken back', async () => {
  const { orgId, owner } = await partner(db, actor)
  const sales = await fiveCustomers(db, owner, 600000, m.in_before)
  await run(db, m.previous)
  await db.query("update partner_promo_grants set expires_at=now()+interval '1 day' where org_id=$1 and period=$2", [orgId, m.previous])
  const last = await sheet(db, orgId, m.previous)
  expect(await confirm(db, actor, last)).toMatchObject({ applied: true, total: 310000 })
  await db.query("select _apply_credit_change($1,'free','admin_adjust',-310000,'收回推广积分',$2)", [owner, 'adj:' + last.id])
  await voidSheet(actor, { grant_id: last.id, reason: '已手动收回' })

  // Every order of the voided sheet is refunded afterwards: nothing is owed from it.
  for (const x of sales) await db.query("select record_payment_issue($1,'refunded',2490)", [x.charge])
  await run(db, m.current)
  expect(await sheet(db, orgId, m.current)).toMatchObject({ base: 10000, clawback_owed: 0, clawback_applied: 0, total: 10000 })
  expect((await sheet(db, orgId, m.current)).detail.sources).toEqual([])
})
