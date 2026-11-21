import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { row } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// Fee go-live (ARCHITECTURE §6.2 订单手续费 · 上线, migration 1820): one audited admin action sets
// record_from and the newest affiliate terms together; one-way; stale forms refused.
let db: Client
let actor: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query("update payment_fee_settings set record_from = null")
  await db.query("update affiliate_settings set terms_version = '2026-11-10'")
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const start = async (input: object, who = actor) => (await row(db, 'select admin_payment_fees_start($1,$2) as r', [who, input])).r
const state = () => row(db, `select (select record_from from payment_fee_settings) as record_from,
  (select terms_version from affiliate_settings) as terms_version`)
const go = { terms_version: '2026-11-21', expected_record_from: null, expected_terms_version: '2026-11-10' }
async function refused(run: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(run()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

it('sets record_from to now and the terms together, audited once; a second click changes nothing', async () => {
  const now = (await row(db, 'select now() as t')).t
  expect(await start(go)).toMatchObject({ applied: true, terms_version: '2026-11-21' })
  expect(await state()).toEqual({ record_from: now, terms_version: '2026-11-21' })
  const audit = await row(db, "select user_id, target_id, reason from admin_audit_log where action='payment_fees_start'")
  expect(audit).toMatchObject({ user_id: actor, target_id: 'payment_fee_settings' })
  expect(JSON.parse(audit.reason as string)).toMatchObject({ terms_version: { before: '2026-11-10', after: '2026-11-21' }, record_from: { before: null } })
  // A double submit (same form) or a replay: already started with these terms.
  expect(await start(go)).toMatchObject({ applied: false, reason: 'already', terms_version: '2026-11-21' })
  expect(await row(db, "select count(*)::int n from admin_audit_log where action='payment_fees_start'")).toEqual({ n: 1 })
})

it('is one-way: once started it cannot be moved or restarted with other terms', async () => {
  await start(go)
  await refused(() => start({ ...go, terms_version: '2026-12-01', expected_terms_version: '2026-11-21' }), 'PAYMENT_FEES_ALREADY_STARTED')
  expect((await state()).terms_version).toBe('2026-11-21')
})

it('refuses a page that was out of date, bad input and non-admins', async () => {
  await refused(() => start({ ...go, expected_terms_version: '2026-11-01' }), 'PAYMENT_FEES_START_CHANGED')
  await refused(() => start({ ...go, expected_record_from: '2031-01-01T00:00:00Z' }), 'PAYMENT_FEES_START_CHANGED')
  await refused(() => start({ ...go, terms_version: 'latest' }), 'INVALID_INPUT')
  await refused(() => start({ terms_version: '2026-11-21' }), 'INVALID_INPUT')
  await refused(async () => start(go, await createUser(db)), 'NOT_ADMIN')
  expect(await state()).toEqual({ record_from: null, terms_version: '2026-11-10' })
})

it('keeps every audit action allowed before, and is service-role only', async () => {
  const def = (await row(db, `select pg_get_constraintdef(oid) d from pg_constraint where conname = 'admin_audit_log_action_check'`)).d as string
  for (const action of ['ban_user', 'affiliate_settings', 'org_package_save', 'blog_publish', 'payment_fees_start']) expect(def).toContain(`'${action}'`)
  expect(await row(db, `select has_function_privilege('anon','admin_payment_fees_start(uuid,jsonb)','execute') a,
    has_function_privilege('authenticated','admin_payment_fees_start(uuid,jsonb)','execute') u,
    has_function_privilege('service_role','admin_payment_fees_start(uuid,jsonb)','execute') s`)).toEqual({ a: false, u: false, s: true })
})
