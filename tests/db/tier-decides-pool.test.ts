import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner, refused } from './partner-promo-fixtures'

// The tier decides the pool (Owner 2026-11-23, ARCHITECTURE §6.1 / §6.5, migration 1996): 1K is
// paid ONLY from the free pool (an org member: the promotion share), 2K / 4K ONLY from the paid
// pool (an org member: the paid share). No fallback to the other pool; a member's choice and
// remembered org_pool_choice no longer pick the pool of a web job. Partner calls keep the old rule.
let db: Client
let actor: string
let template: string
let m: Awaited<ReturnType<typeof months>>
const PRICE = { '1k': 10, '2k': 20, '4k': 30 } as const
type Tier = keyof typeof PRICE
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await adminActor(db)
  m = await months(db)
  // Raw fixture key 3k is stored as 4k (1451).
  template = await seedTemplate(db, { visibleIn: ['web', 'partner'], credits: { '1k': PRICE['1k'], '2k': PRICE['2k'], '3k': PRICE['4k'] } })
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

type Job = { credit_pool: string; credits_cost: number }
async function generate(user: string, tier: Tier, extra: { choice?: string; source?: string } = {}) {
  const inputs = { resolution: tier, attempt_id: randomUUID(), ...(extra.choice ? { pool_choice: extra.choice } : {}) }
  return row(db, "select credit_pool, credits_cost from reserve_credits($1,$2,'image',$3,$4,$5,$6)",
    [randomUUID(), user, template, PRICE[tier], extra.source ?? 'web', inputs]) as Promise<Job>
}
const balances = (user: string) => row(db, 'select credits, free_credits, org_pool_choice from profiles where id=$1', [user])
const jobs = async (user: string) => Number((await row(db, 'select count(*) n from generation_jobs where user_id=$1', [user])).n)

// A partner org with both pools filled and one member holding `paid` and `promo` org credits.
async function member(paid: number, promo: number, own: { credits?: number; free?: number } = {}) {
  const { orgId, owner } = await partner(db, actor)
  await db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits: 5000, reason: 't', request_key: randomUUID() }])
  await db.query('select admin_org_grant($1,$2)', [actor, { org_id: orgId, kind: 'bank_grant', credits: 5000, request_id: 'bank:' + randomUUID() }])
  const staff = await createUser(db, { credits: own.credits ?? 0, freeCredits: own.free ?? 0 })
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [staff, orgId])
  if (paid) await db.query('select org_allocate($1,$2,$3,$4)', [owner, staff, paid, randomUUID()])
  if (promo) await db.query('select org_allocate_promo($1,$2,$3,$4)', [owner, staff, promo, randomUUID()])
  return { orgId, staff }
}

it('pays a personal 1K job from free credits only, leaving paid credits untouched', async () => {
  const both = await createUser(db, { credits: 100, freeCredits: 15 })
  expect(await generate(both, '1k')).toEqual({ credit_pool: 'free', credits_cost: 10 })
  expect(await balances(both)).toMatchObject({ credits: 100, free_credits: 5 })
  // Free credits short: refused, never charged to the 100 paid credits.
  await refused(db, () => generate(both, '1k'), 'CREDITS_INSUFFICIENT')
  const paidOnly = await createUser(db, { credits: 500 })
  await refused(db, () => generate(paidOnly, '1k'), 'CREDITS_INSUFFICIENT')
  expect(await balances(paidOnly)).toMatchObject({ credits: 500, free_credits: 0 })
  expect(await jobs(paidOnly)).toBe(0)
})

it.each(['2k', '4k'] as const)('pays a personal %s job from paid credits only, never free credits', async (tier) => {
  const both = await createUser(db, { credits: PRICE[tier], freeCredits: 500 })
  expect(await generate(both, tier)).toEqual({ credit_pool: 'paid', credits_cost: PRICE[tier] })
  expect(await balances(both)).toMatchObject({ credits: 0, free_credits: 500 })
  await refused(db, () => generate(both, tier), 'CREDITS_INSUFFICIENT')
  const freeOnly = await createUser(db, { freeCredits: 500 })
  await refused(db, () => generate(freeOnly, tier), 'CREDITS_INSUFFICIENT')
  expect(await balances(freeOnly)).toMatchObject({ credits: 0, free_credits: 500 })
  expect(await jobs(freeOnly)).toBe(0)
})

it('pays an org member’s 1K from the promotion share only and 2K / 4K from the paid share only', async () => {
  const { orgId, staff } = await member(100, 100, { credits: 7, free: 9 })
  expect(await generate(staff, '1k')).toMatchObject({ credit_pool: 'free' })
  expect(await generate(staff, '2k')).toMatchObject({ credit_pool: 'paid' })
  expect(await generate(staff, '4k')).toMatchObject({ credit_pool: 'paid' })
  expect(await row(db, 'select held_credits, held_promo_credits from org_members where org_id=$1 and user_id=$2', [orgId, staff]))
    .toEqual({ held_credits: 50, held_promo_credits: 90 })
  expect(await balances(staff)).toMatchObject({ credits: 57, free_credits: 99 }) // own 7 and 9 untouched
})

it('refuses a member’s tier when its share is short, never using the other share or their own credits', async () => {
  const paidShare = await member(500, 0, { free: 500 })
  await refused(db, () => generate(paidShare.staff, '1k'), 'ORG_CREDITS_INSUFFICIENT')
  const promoShare = await member(0, 500, { credits: 500 })
  await refused(db, () => generate(promoShare.staff, '2k'), 'ORG_CREDITS_INSUFFICIENT')
  await refused(db, () => generate(promoShare.staff, '4k'), 'ORG_CREDITS_INSUFFICIENT')
  expect(await jobs(paidShare.staff) + await jobs(promoShare.staff)).toBe(0)
  expect(await balances(paidShare.staff)).toMatchObject({ credits: 500, free_credits: 500 })
  expect(await balances(promoShare.staff)).toMatchObject({ credits: 500, free_credits: 500 })
})

it('lets neither a sent choice nor the remembered one override the tier', async () => {
  const { staff } = await member(100, 100)
  await db.query("update profiles set org_pool_choice='paid' where id=$1", [staff])
  expect(await generate(staff, '1k', { choice: 'paid' })).toMatchObject({ credit_pool: 'free' })
  expect(await generate(staff, '2k', { choice: 'promo' })).toMatchObject({ credit_pool: 'paid' })
  expect((await balances(staff)).org_pool_choice).toBe('paid') // not rewritten by the tier
  const outsider = await createUser(db, { credits: 50 })
  await refused(db, () => generate(outsider, '1k', { choice: 'paid' }), 'CREDITS_INSUFFICIENT')
  await refused(db, () => generate(staff, '1k', { choice: 'gift' }), 'INVALID_INPUT')
})

it('keeps the 1897 rule for partner calls: paid first, then free', async () => {
  const user = await createUser(db, { credits: 10, freeCredits: 10 })
  expect(await generate(user, '1k', { source: 'graylum' })).toMatchObject({ credit_pool: 'paid' })
  expect(await generate(user, '1k', { source: 'graylum' })).toMatchObject({ credit_pool: 'free' })
})

it('keeps a batch paid only: a 2K cell from paid credits, a 1K cell refused with nothing charged', async () => {
  const user = await createUser(db, { credits: 100, freeCredits: 100 })
  const cell = (tier: Tier) => row(db, "select credit_pool from reserve_batch_cell($1,$2,'image',$3,$4,$5,null,null)",
    [randomUUID(), user, template, PRICE[tier], { resolution: tier, attempt_id: randomUUID(), batch_size: 2 }])
  expect(await cell('2k')).toEqual({ credit_pool: 'paid' })
  await refused(db, () => cell('1k'), 'CREDITS_INSUFFICIENT')
  expect(await balances(user)).toMatchObject({ credits: 80, free_credits: 100 })
  expect(await jobs(user)).toBe(1)
})

// 作品编辑 is exempt (Owner 2026-11-23): paid first, then free, at any tier; a free-pool edit is a free work.
it('pays a 2K edit from paid credits first, then free credits', async () => {
  const user = await createUser(db, { credits: PRICE['2k'] })
  const parent = randomUUID()
  await db.query("select reserve_credits($1,$2,'image',$3,$4,'web',$5)", [parent, user, template, PRICE['2k'], { resolution: '2k', attempt_id: randomUUID() }])
  await db.query("update generation_jobs set status='succeeded', output_key='t1996/x', finished_at=now() where id=$1", [parent])
  const cost = Number((await row(db, "select (credits_cost->>'2k')::int c from templates where id='edit'")).c)
  const edit = (tier: '2k') => row(db, "select credit_pool, visibility from reserve_credits($1,$2,'image','edit',$3,'web',$4,null,null,null,$5)",
    [randomUUID(), user, cost, { resolution: tier, attempt_id: randomUUID() }, parent])
  await db.query('update profiles set credits=$2, free_credits=$2 where id=$1', [user, cost])
  expect(await edit('2k')).toEqual({ credit_pool: 'paid', visibility: 'private' })
  expect(await edit('2k')).toEqual({ credit_pool: 'free', visibility: 'public' }) // paid gone: free, a free work
  await refused(db, () => edit('2k'), 'CREDITS_INSUFFICIENT')
})

it('keeps the new helper private', async () => {
  const fn = 'public._reserve_pool_for_tier(public.profiles,integer,text,text,text)'
  expect(await row(db, `select has_function_privilege('service_role',$1,'execute') s, has_function_privilege('authenticated',$1,'execute') u,
    has_function_privilege('anon',$1,'execute') a`, [fn])).toEqual({ s: false, u: false, a: false })
})
