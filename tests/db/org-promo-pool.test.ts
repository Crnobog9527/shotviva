import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, asLegacy, confirm, freeOf, months, partner, promoPoolOf, refused, run, sheet } from './partner-promo-fixtures'

// The enterprise promotion pool (ARCHITECTURE §6.5 企业推广积分池, migrations 1890–1895): partner
// grants land in the org, the owner hands paid and promotion credits to members separately, a
// generation spends paid first and the org's promotion share before the member's own free credits,
// refunds go back to the pool kind they came from, promotion credits expire at month end (pool and
// member-held), and grants made before 1894 still expire in the owner's own pool.
let db: Client
let actor: string
let m: Awaited<ReturnType<typeof months>>
let template: string | undefined
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await adminActor(db)
  m = await months(db)
  template = undefined // seeded inside each rolled-back test
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const topup = (orgId: string, owner: string, credits: number) =>
  db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits, reason: 'test', request_key: randomUUID() }])

// A partner org with `promo` promotion credits and `paid` paid credits in its pools, and one member.
async function org(promo: number, paid = 0) {
  const p = await partner(db, actor)
  if (promo) await topup(p.orgId, p.owner, promo)
  if (paid) await db.query('select admin_org_grant($1,$2)', [actor, { org_id: p.orgId, kind: 'bank_grant', credits: paid, request_id: 'bank:' + randomUUID() }])
  const staff = await createUser(db)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [p.orgId])
  await db.query('select org_join($1,$2)', [staff, invite_token])
  return { ...p, staff }
}
const seat = (orgId: string, user: string) =>
  row(db, 'select held_credits, held_promo_credits, promo_allowance, status from org_members where org_id=$1 and user_id=$2', [orgId, user])
const pools = (orgId: string) => row(db, 'select pool_credits::int paid, promo_pool_credits::int promo from orgs where id=$1', [orgId])
const balances = (user: string) => row(db, 'select credits, free_credits from profiles where id=$1', [user])
const allocate = (owner: string, member: string, n: number, id: string = randomUUID()) =>
  row(db, 'select org_allocate($1,$2,$3,$4) r', [owner, member, n, id]).then((x) => x.r)
const allocatePromo = (owner: string, member: string, n: number, id: string = randomUUID()) =>
  row(db, 'select org_allocate_promo($1,$2,$3,$4) r', [owner, member, n, id]).then((x) => x.r)

// A 1k generation of the seeded template (cost 10) and its failure refund.
async function generate(user: string) {
  template ??= await seedTemplate(db, { credits: { '1k': 10, '2k': 20, '3k': 30 } })
  const job = randomUUID()
  const r = await row(db, "select credit_pool, visibility from reserve_credits($1,$2,'image',$3,10,'web',$4)",
    [job, user, template, { resolution: '1k', attempt_id: randomUUID() }])
  return { job, ...r } as { job: string; credit_pool: string; visibility: string }
}
const fail = (job: string) => db.query("select refund_job($1,'TEST_FAILED')", [job])
const expirePass = async () => (await row(db, 'select partner_promo_expire_run() as r')).r
const endMonth = (orgId: string) => db.query("update orgs set promo_expires_at=now()-interval '1 second' where id=$1", [orgId])

it('allocates both kinds separately, each once per request id', async () => {
  const { orgId, owner, staff } = await org(5000, 3000)
  const id = randomUUID()
  expect(await allocatePromo(owner, staff, 2000, id)).toMatchObject({ applied: true, promo_pool_credits: 3000, held_promo_credits: 2000 })
  expect(await allocatePromo(owner, staff, 2000, id)).toMatchObject({ applied: false, promo_pool_credits: 3000 })
  await refused(db, () => allocatePromo(owner, staff, 1500, id), 'IDEMPOTENCY_CONFLICT')
  await refused(db, () => allocate(owner, staff, 2000, id), 'IDEMPOTENCY_CONFLICT') // a paid move under the promo id
  expect(await allocate(owner, staff, 1000)).toMatchObject({ applied: true, pool_credits: 2000, held_credits: 1000 })
  expect(await balances(staff)).toEqual({ credits: 1000, free_credits: 2000 })
  expect(await seat(orgId, staff)).toMatchObject({ held_credits: 1000, held_promo_credits: 2000 })
  expect(await pools(orgId)).toEqual({ paid: 2000, promo: 3000 })
  await refused(db, () => allocatePromo(owner, staff, 3001), 'ORG_POOL_INSUFFICIENT')
  expect(await row(db, "select kind, pool, delta from credit_ledger where idempotency_key=$1", ['org_promo:' + id]))
    .toEqual({ kind: 'org_promo_allocate', pool: 'free', delta: 2000 })
  // System keys are reserved.
  for (const bad of ['org_promo_topup:x', 'partner_promo:1', 'org_return:x']) await refused(db, () => allocatePromo(owner, staff, 1, bad), 'INVALID_INPUT')
})

it("gives each member this month's promotion allowance once, the rest when more credits arrive", async () => {
  const { orgId, owner, staff } = await org(0)
  const second = await createUser(db)
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [second, orgId])
  await db.query("update org_members set joined_at=now()+interval '1 second' where user_id=$1", [second]) // joined after staff
  await db.query('select org_set_promo_allowance($1,$2,2000)', [owner, staff])
  await db.query('select org_set_promo_allowance($1,$2,2000)', [owner, second])
  expect(await seat(orgId, staff)).toMatchObject({ promo_allowance: 2000, held_promo_credits: 0 }) // nothing in the pool yet
  await topup(orgId, owner, 3000) // join order: staff 2,000, second 1,000 (short 1,000)
  expect((await seat(orgId, staff)).held_promo_credits).toBe(2000)
  expect((await seat(orgId, second)).held_promo_credits).toBe(1000)
  await topup(orgId, owner, 5000) // second gets the missing 1,000; staff nothing more this month
  expect((await seat(orgId, staff)).held_promo_credits).toBe(2000)
  expect((await seat(orgId, second)).held_promo_credits).toBe(2000)
  expect(await pools(orgId)).toMatchObject({ promo: 4000 })
  expect(await row(db, 'select granted, short from org_member_promo_topups where org_id=$1 and user_id=$2', [orgId, second])).toEqual({ granted: 2000, short: 0 })
  // Raising the allowance gives the difference at once; lowering it takes nothing back.
  await db.query('select org_set_promo_allowance($1,$2,2500)', [owner, staff])
  expect((await seat(orgId, staff)).held_promo_credits).toBe(2500)
  await db.query('select org_set_promo_allowance($1,$2,0)', [owner, staff])
  expect((await seat(orgId, staff)).held_promo_credits).toBe(2500)
  // The paid monthly allowance is a different column and pool.
  expect(await row(db, 'select monthly_allowance from org_members where org_id=$1 and user_id=$2', [orgId, staff])).toEqual({ monthly_allowance: 0 })
})

it('spends paid first, then the org promotion share before the member’s own free credits; rights follow the pool', async () => {
  const { orgId, owner, staff } = await org(1000, 1000)
  await db.query('update profiles set free_credits=50 where id=$1', [staff]) // the member's own free credits
  await allocate(owner, staff, 15)
  await allocatePromo(owner, staff, 25)
  const paid = await generate(staff)
  expect(paid).toMatchObject({ credit_pool: 'paid', visibility: 'private' })
  expect(await balances(staff)).toEqual({ credits: 5, free_credits: 75 })
  const promo = await generate(staff) // 5 paid left: not enough, the whole order goes to the free pool
  expect(promo).toMatchObject({ credit_pool: 'free', visibility: 'private' }) // a free work (watermark, no commercial use), and an org work: never public (#842)
  expect(await balances(staff)).toEqual({ credits: 5, free_credits: 65 })
  expect(await seat(orgId, staff)).toMatchObject({ held_credits: 5, held_promo_credits: 15 }) // promotion share drawn first
  await generate(staff)
  await generate(staff) // 5 of the share + 5 of the member's own
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 0 })
  expect(await freeOf(db, staff)).toBe(45)
})

it('refunds a failed job to the pool kind it came from and restores the org share', async () => {
  const { orgId, owner, staff } = await org(1000, 1000)
  await allocate(owner, staff, 10)
  await allocatePromo(owner, staff, 30)
  const paid = await generate(staff)
  const free = await generate(staff)
  expect(await seat(orgId, staff)).toMatchObject({ held_credits: 0, held_promo_credits: 20 })
  await fail(paid.job)
  await fail(free.job)
  await fail(free.job) // a repeat refunds nothing
  expect(await balances(staff)).toEqual({ credits: 10, free_credits: 30 })
  expect(await seat(orgId, staff)).toMatchObject({ held_credits: 10, held_promo_credits: 30 })
  expect(await row(db, 'select drawn, restored, period from org_promo_draws where debit_key=$1', ['job:' + free.job + ':reserve']))
    .toEqual({ drawn: 10, restored: 10, period: m.current })
})

it('expires the promo pool and member-held promotion credits at month end, once, never the paid ones or own free credits', async () => {
  const { orgId, owner, staff } = await org(5000, 1000)
  await db.query('update profiles set free_credits=70 where id=$1', [staff])
  await allocate(owner, staff, 500)
  await allocatePromo(owner, staff, 2000)
  await generate(staff) // paid
  await db.query('update profiles set credits=0 where id=$1', [staff]) // (test shortcut: no paid left)
  await db.query('update org_members set held_credits=0 where org_id=$1 and user_id=$2', [orgId, staff])
  await generate(staff) // 10 of the promotion share
  await endMonth(orgId)
  expect(await expirePass()).toMatchObject({ expired: 1, taken: 3000 + 1990, failed: [] })
  expect(await pools(orgId)).toEqual({ paid: 500, promo: 0 })
  expect(await balances(staff)).toEqual({ credits: 0, free_credits: 70 })
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 0 })
  expect(await row(db, 'select promo_expires_at from orgs where id=$1', [orgId])).toEqual({ promo_expires_at: null })
  expect(await expirePass()).toMatchObject({ expired: 0, taken: 0 })
  expect(await row(db, "select count(*)::int n from org_credit_ledger where org_id=$1 and kind='promo_expire'", [orgId])).toEqual({ n: 1 })
  expect(await row(db, "select count(*)::int n from credit_ledger where user_id=$1 and kind='org_promo_expire'", [staff])).toEqual({ n: 1 })
})

it('takes back a refund of a promotion-paid job that lands after its month, instead of restoring it', async () => {
  const { orgId, owner, staff } = await org(1000)
  await allocatePromo(owner, staff, 100)
  const job = await generate(staff)
  // The job was reserved last month; that month's credits have expired since.
  await db.query("update org_promo_draws set period=$2 where debit_key=$1", ['job:' + job.job + ':reserve', m.previous])
  await fail(job.job)
  expect(await freeOf(db, staff)).toBe(90) // the 10 came back and expired at once
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 90 })
  expect(await row(db, "select kind, delta from credit_ledger where idempotency_key=$1", ['org_promo_return:job:' + job.job + ':refund']))
    .toEqual({ kind: 'org_promo_expire', delta: -10 })
})

it('a grant in a new month first expires the old month (no carry-over)', async () => {
  const { orgId, owner, staff } = await org(3000)
  await allocatePromo(owner, staff, 1000)
  await endMonth(orgId)
  await topup(orgId, owner, 4000) // the cron has not run yet
  expect(await pools(orgId)).toMatchObject({ promo: 4000 })
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 0 })
  expect(await freeOf(db, staff)).toBe(0)
})

it('returns each kind to its own pool when a member leaves or is removed; the member’s own credits stay', async () => {
  const { orgId, owner, staff } = await org(1000, 1000)
  await db.query('update profiles set credits=7, free_credits=9 where id=$1', [staff])
  await allocate(owner, staff, 100)
  await allocatePromo(owner, staff, 200)
  expect(await row(db, "select org_leave($1,'leave-1') r", [staff])).toEqual({ r: 100 })
  expect(await balances(staff)).toEqual({ credits: 7, free_credits: 9 })
  expect(await pools(orgId)).toEqual({ paid: 1000, promo: 1000 })
  expect(await seat(orgId, staff)).toMatchObject({ status: 'removed', held_credits: 0, held_promo_credits: 0 })
  expect(await row(db, "select kind, delta::int from org_credit_ledger where request_id='leave-1:promo'")).toEqual({ kind: 'promo_reclaim', delta: 200 })

  const other = await createUser(db)
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [other, orgId])
  await allocatePromo(owner, other, 300)
  expect(await row(db, "select org_remove_member($1,$2,'rm-1') r", [owner, other])).toEqual({ r: 0 })
  expect(await pools(orgId)).toEqual({ paid: 1000, promo: 1000 })
  expect(await freeOf(db, other)).toBe(0)
})

it('sends the promotion part of a refund after leaving back to the promo pool in the same month', async () => {
  const { orgId, owner, staff } = await org(1000)
  await allocatePromo(owner, staff, 100)
  const job = await generate(staff)
  await db.query("select org_leave($1,'leave-2')", [staff]) // 90 back
  await fail(job.job)
  expect(await freeOf(db, staff)).toBe(0)
  await db.query('select org_rotate_invite($1)', [owner]) // any owner action settles the queue
  expect(await pools(orgId)).toMatchObject({ promo: 1000 })
})

it('refuses non-owners and keeps every new table and function away from clients', async () => {
  const { orgId, staff } = await org(1000)
  const outsider = await createUser(db)
  await refused(db, () => allocatePromo(staff, staff, 10), 'NOT_ORG_OWNER')
  await refused(db, () => db.query('select org_set_promo_allowance($1,$2,10)', [outsider, staff]), 'NOT_ORG_OWNER')
  await refused(db, () => db.query('select org_pool_month($1,$2)', [staff, m.current]), 'NOT_ORG_OWNER')
  await refused(db, () => db.query('select * from org_member_promo_stats($1,$2,$3)', [outsider, orgId, m.current]), 'NOT_ORG_MEMBER')
  const fns = ['org_allocate_promo(uuid,uuid,integer,text)', 'org_set_promo_allowance(uuid,uuid,integer)', 'org_pool_month(uuid,text)',
    'org_member_promo_stats(uuid,uuid,text)',]
  const internal = ['_org_promo_expire_due(uuid)', '_org_allocate_promo(uuid,uuid,integer,text,uuid)', '_org_promo_topup(uuid)',
    '_org_promo_grant(uuid,integer,timestamptz,text,text,uuid)', '_org_promo_follows_ledger()', '_utc_period(timestamptz)']
  for (const fn of fns) {
    expect(await row(db, `select has_function_privilege('anon','public.${fn}','execute') a, has_function_privilege('authenticated','public.${fn}','execute') u,
      has_function_privilege('service_role','public.${fn}','execute') s`)).toEqual({ a: false, u: false, s: true })
  }
  for (const fn of internal) {
    expect(await row(db, `select has_function_privilege('authenticated','public.${fn}','execute') u,
      has_function_privilege('service_role','public.${fn}','execute') s`)).toEqual({ u: false, s: false })
  }
  for (const table of ['org_promo_draws', 'org_member_promo_topups']) {
    expect(await row(db, `select relrowsecurity r from pg_class where oid='public.${table}'::regclass`)).toEqual({ r: true })
    expect(await row(db, `select has_table_privilege('authenticated','public.${table}','select') u, has_table_privilege('anon','public.${table}','select') a,
      has_table_privilege('service_role','public.${table}','select') s, has_table_privilege('service_role','public.${table}','insert') w`))
      .toEqual({ u: false, a: false, s: true, w: false })
  }
})

it('shows the owner both pools for the month and each member their promotion numbers', async () => {
  const { orgId, owner, staff } = await org(5000, 2000)
  await allocate(owner, staff, 300)
  await allocatePromo(owner, staff, 700)
  await db.query('update profiles set credits=0 where id=$1', [staff])
  await db.query('update org_members set held_credits=0 where org_id=$1 and user_id=$2', [orgId, staff])
  await generate(staff)
  const view = (await row(db, 'select org_pool_month($1,$2) v', [owner, m.current])).v
  expect(view.paid).toMatchObject({ balance: 1700, in: 2000, allocated: 300 })
  expect(view.promo).toMatchObject({ balance: 4300, granted: 5000, allocated: 700, held: 690, expired: 0 })
  const mine = (await db.query('select * from org_member_promo_stats($1,$2,$3)', [staff, orgId, m.current])).rows
  expect(mine).toEqual([{ member_user_id: staff, promo_allowance: 0, held_promo: 690, promo_allocated: '700', promo_used: '10' }])
  expect((await db.query('select * from org_member_promo_stats($1,$2,$3)', [owner, orgId, m.current])).rows).toHaveLength(2)
})

it('takes a clawback from the next grant into the pool, never from credits already granted', async () => {
  const { orgId, owner } = await partner(db, actor)
  await topup(orgId, owner, 2000)
  await db.query("insert into partner_promo_grants(org_id, period, status, recipient_user_id, base, bonus, raw_credits, counted_credits, customer_cap, customers, capped_customers, clawback_owed, clawback_applied, total, fingerprint, expires_at, decided_at, destination) values ($1,$2,'granted',$3,10000,4000,0,0,0,0,0,0,0,14000,md5('x'),now()-interval '20 days',now()-interval '40 days','org')", [orgId, m.previous, owner])
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  expect(s).toMatchObject({ clawback_owed: 4000, clawback_applied: 4000, total: 6000 })
  await confirm(db, actor, s)
  expect(await promoPoolOf(db, orgId)).toBe(2000 + 6000)
})

it('does not count spending paid from an org promotion share against a legacy grant (Codex #836)', async () => {
  const { orgId, owner } = await partner(db, actor)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s) // 10,000 into the org pool
  await asLegacy(db, 'partner_promo_grants', s.id) // now in the owner's own pool, as before 1894
  await db.query("update partner_promo_grants set decided_at=now()-interval '1 hour' where id=$1", [s.id])
  await topup(orgId, owner, 300)
  await db.query("select org_allocate_promo($1,$1,300,'self-300')", [owner]) // the owner holds 300 of the org's
  const key = 'job:' + randomUUID()
  await db.query("select _apply_credit_change($1,'free','reserve',-300,'job',$2)", [owner, key + ':reserve'])
  // The 300 came from the org share, so the legacy grant still has all 10,000 left to expire.
  expect((await row(db, "select credits_left from _partner_promo_bucket_left($1,(select expires_at from partner_promo_grants where id=$2))", [owner, s.id])).credits_left).toBe(10000)
  // A failed job gives the share back; still nothing is counted against the legacy grant.
  await db.query("select _apply_credit_change($1,'free','refund',300,'job',$2)", [owner, key + ':refund'])
  expect((await row(db, "select credits_left from _partner_promo_bucket_left($1,(select expires_at from partner_promo_grants where id=$2))", [owner, s.id])).credits_left).toBe(10000)
})

it('ends with the 1921 definitions: the org pool and the voided-sheet filter of 1920 together', async () => {
  const def = async (sig: string) => (await row(db, `select pg_get_functiondef('public.${sig}'::regprocedure) d`)).d as string
  const bucket = await def('_partner_promo_bucket_left(uuid,timestamptz)')
  expect(bucket).toContain('voided_at is null')
  expect(bucket).toContain("destination = 'owner'")
  expect(bucket).toContain('org_promo_draws')
  const expire = await def('_partner_promo_expire()')
  expect(expire).toContain('voided_at is null')
  expect(expire).toContain('_org_promo_expire_due')
  const month = await def('org_promo_month(uuid,timestamptz)')
  expect(month).toContain('voided_at is null')
  expect(month).toContain('promo_pool_credits')
})

it('ends with the 1921 definitions on production too, where 1920 ran before 1890–1894', async () => {
  // Production order with --include-all: 1920 (already applied), then this PR's 1890–1894 and 1921.
  // Re-run 1920's function bodies, then 1921: the final bodies must be 1921's again.
  const dir = path.join(process.cwd(), 'supabase/migrations')
  const replaced = readFileSync(path.join(dir, '1920_partner_promo_void.sql'), 'utf8')
    .split(/\n(?=create or replace function )/).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('\n$$;') + 4))
  expect(replaced.length).toBeGreaterThanOrEqual(3)
  for (const sql of replaced) await db.query(sql)
  expect((await row(db, "select pg_get_functiondef('public._partner_promo_expire()'::regprocedure) d")).d).not.toContain('_org_promo_expire_due')
  await db.query(readFileSync(path.join(dir, '1921_org_promo_pool_reads.sql'), 'utf8'))
  for (const [sig, mark] of [['_partner_promo_bucket_left(uuid,timestamptz)', 'org_promo_draws'], ['_partner_promo_expire()', '_org_promo_expire_due'], ['org_promo_month(uuid,timestamptz)', 'promo_pool_credits']]) {
    const d = (await row(db, `select pg_get_functiondef('public.${sig}'::regprocedure) d`)).d as string
    expect(d).toContain(mark)
    expect(d).toContain('voided_at is null')
  }
})

it('records a draw under the month its share was funded for, so a refund after the expiry cannot bring expired credits back (Codex #836)', async () => {
  const { orgId, owner, staff } = await org(1000)
  await allocatePromo(owner, staff, 100)
  // The month is over (expiry at the start of this UTC month) but the expiry pass has not run yet.
  await db.query("update orgs set promo_expires_at=(date_trunc('month', now() at time zone 'UTC')) at time zone 'UTC' where id=$1", [orgId])
  const job = await generate(staff) // spends 10 of last month's share
  expect(await row(db, 'select period from org_promo_draws where debit_key=$1', ['job:' + job.job + ':reserve'])).toEqual({ period: m.previous })
  await expirePass() // takes back the 90 still held
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 0 })
  await fail(job.job) // the job fails after the expiry: its 10 expire at once, nothing is restored
  expect(await freeOf(db, staff)).toBe(0)
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 0 })
})


it('starts a rejoining member with no promotion allowance, as the paid one (Codex #836)', async () => {
  const { orgId, owner, staff } = await org(1000)
  await db.query('select org_set_promo_allowance($1,$2,700)', [owner, staff])
  expect(await seat(orgId, staff)).toMatchObject({ promo_allowance: 700, held_promo_credits: 700 })
  await db.query("select org_leave($1,'leave-rejoin')", [staff])
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [staff, orgId])
  expect(await seat(orgId, staff)).toMatchObject({ status: 'active', promo_allowance: 0, held_promo_credits: 0 })
  expect(await row(db, 'select monthly_allowance, held_credits from org_members where org_id=$1 and user_id=$2', [orgId, staff])).toEqual({ monthly_allowance: 0, held_credits: 0 })
})

it('refuses to void a sheet granted into the org promo pool (Claude review #836)', async () => {
  const { orgId } = await partner(db, actor)
  await run(db, m.current)
  const s = await sheet(db, orgId, m.current)
  await confirm(db, actor, s) // destination 'org'
  await refused(db, () => db.query('select admin_partner_promo_void($1,$2)', [actor, { grant_id: s.id, reason: 'x' }]), 'PROMO_GRANT_IN_ORG_POOL')
  expect(await row(db, 'select voided_at from partner_promo_grants where id=$1', [s.id])).toEqual({ voided_at: null })
})

it('lets only a generation reserve draw the org promotion share first; other free debits only cap it (Claude review #836)', async () => {
  const { orgId, owner, staff } = await org(1000)
  await db.query('update profiles set free_credits=50 where id=$1', [staff]) // own free credits
  await allocatePromo(owner, staff, 100) // free 150, share 100
  await db.query("select _apply_credit_change($1,'free','admin_adjust',-30,'fix','adj-a')", [staff])
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 100 }) // taken from own credits, share intact
  expect(await row(db, "select count(*)::int n from org_promo_draws where debit_key='adj-a'")).toEqual({ n: 0 })
  await db.query("select _apply_credit_change($1,'free','admin_adjust',-80,'fix','adj-b')", [staff]) // balance 40 < share
  expect(await seat(orgId, staff)).toMatchObject({ held_promo_credits: 40 }) // only capped at the balance
  expect(await row(db, "select count(*)::int n from org_promo_draws where debit_key='adj-b'")).toEqual({ n: 0 })
})
