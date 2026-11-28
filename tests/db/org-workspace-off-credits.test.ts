import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner, refused } from './partner-promo-fixtures'

// 2034 (Owner 2026-11-28): with the org's workspace off (orgs.status 'suspended'), a member may
// pay from their own credits too. A job is paid wholly by the org's share when it covers the
// price, else wholly by the member's own credits; never split. Seats of an active org keep 1897.
let db: Client
let actor: string
let template: string | undefined
let m: Awaited<ReturnType<typeof months>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await adminActor(db)
  m = await months(db)
  template = undefined
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

// A member holding `paid` / `promo` org credits and `own` credits of their own, in an org whose
// workspace is then turned off.
async function idleSeat(paid: number, promo: number, own: { credits?: number; free?: number }, off = true) {
  const { orgId, owner } = await partner(db, actor)
  await db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits: 5000, reason: 't', request_key: randomUUID() }])
  await db.query('select admin_org_grant($1,$2)', [actor, { org_id: orgId, kind: 'bank_grant', credits: 5000, request_id: 'bank:' + randomUUID() }])
  const staff = await createUser(db, { credits: own.credits ?? 0, freeCredits: own.free ?? 0 })
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [staff, orgId])
  if (paid) await db.query('select org_allocate($1,$2,$3,$4)', [owner, staff, paid, randomUUID()])
  if (promo) await db.query('select org_allocate_promo($1,$2,$3,$4)', [owner, staff, promo, randomUUID()])
  if (off) await db.query("update public.orgs set status = 'suspended' where id = $1", [orgId])
  return { orgId, owner, staff }
}

const PRICE = { '1k': 10, '2k': 20 } as const
const seed = async () => (template ??= await seedTemplate(db, { visibleIn: ['web', 'partner'], credits: { '1k': 10, '2k': 20, '3k': 30 } }))
async function generate(user: string, tier: keyof typeof PRICE, choice?: string) {
  await seed()
  const id = randomUUID()
  const inputs = { resolution: tier, attempt_id: randomUUID(), ...(choice ? { pool_choice: choice } : {}) }
  const job = await row(db, "select id, credit_pool, org_id from reserve_credits($1,$2,'image',$3,$4,'web',$5,null,null,null)", [id, user, template, PRICE[tier], inputs])
  return job as { id: string; credit_pool: string; org_id: string | null }
}
const seat = (user: string) => row(db, `select p.credits, p.free_credits, m.held_credits, m.held_promo_credits
  from profiles p join org_members m on m.user_id = p.id and m.status = 'active' where p.id = $1`, [user])

it('pays a job from the member’s own credits when the org has no share for it', async () => {
  const { staff } = await idleSeat(0, 0, { credits: 500, free: 50 })
  expect(await generate(staff, '2k')).toMatchObject({ credit_pool: 'paid', org_id: null })
  expect(await generate(staff, '1k')).toMatchObject({ credit_pool: 'free', org_id: null })
  expect(await seat(staff)).toMatchObject({ credits: 480, free_credits: 40, held_credits: 0, held_promo_credits: 0 })
})

it('still pays from the org’s share when it covers the job, as an org work', async () => {
  const { orgId, staff } = await idleSeat(100, 0, { credits: 500 })
  expect(await generate(staff, '2k')).toMatchObject({ credit_pool: 'paid', org_id: orgId })
  expect(await seat(staff)).toMatchObject({ credits: 580, held_credits: 80 })
})

it('never splits a job: a share too small leaves it untouched and the member’s own credits pay', async () => {
  const { staff } = await idleSeat(5, 0, { credits: 500 })
  expect(await generate(staff, '2k')).toMatchObject({ credit_pool: 'paid', org_id: null })
  expect(await seat(staff)).toMatchObject({ credits: 485, held_credits: 5 })
  expect((await row(db, 'select count(*)::int n from org_held_draws where user_id = $1', [staff])).n).toBe(0)
})

it('refuses as for anyone else when neither the share nor the own credits cover the job', async () => {
  const { staff } = await idleSeat(5, 0, { credits: 10 })
  await refused(db, () => generate(staff, '2k'), 'CREDITS_INSUFFICIENT')
  expect(await seat(staff)).toMatchObject({ credits: 15, held_credits: 5 })
})

it('uses a live promotion share first and own free credits otherwise, with no picker', async () => {
  const { orgId, staff } = await idleSeat(100, 30, { free: 50 })
  expect(await generate(staff, '1k', 'paid')).toMatchObject({ credit_pool: 'free', org_id: orgId })
  expect(await seat(staff)).toMatchObject({ free_credits: 70, held_promo_credits: 20 })
  await db.query('update org_members set held_promo_credits = 5 where user_id = $1', [staff])
  expect(await generate(staff, '1k')).toMatchObject({ credit_pool: 'free', org_id: null })
  expect(await seat(staff)).toMatchObject({ free_credits: 60, held_promo_credits: 5 })
})

it('gives a failed own-paid job back to the member without touching the org share', async () => {
  const { staff } = await idleSeat(5, 0, { credits: 500 })
  const job = await generate(staff, '2k')
  await db.query("select public.refund_job($1, 'TEST_FAILED')", [job.id])
  expect(await seat(staff)).toMatchObject({ credits: 505, held_credits: 5 })
})

it('keeps an active org’s seats on org shares only', async () => {
  const { staff } = await idleSeat(5, 0, { credits: 500 }, false)
  await refused(db, () => generate(staff, '2k'), 'ORG_CREDITS_INSUFFICIENT')
})
