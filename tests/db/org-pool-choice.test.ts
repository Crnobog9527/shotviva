import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner, refused } from './partner-promo-fixtures'

// 出图时让员工自选 (ARCHITECTURE §6.5, migrations 1896–1897): a member holding BOTH kinds of org
// credits picks which kind pays; the server honours it, refuses when the chosen kind is short
// (never falls back), ignores it for everyone else and for non-web sources, and remembers it.
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

// A partner org with both pools filled and one member holding `paid` and `promo` org credits.
async function member(paid: number, promo: number, own: { credits?: number; free?: number } = {}) {
  const { orgId, owner } = await partner(db, actor)
  await db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits: 5000, reason: 't', request_key: randomUUID() }])
  await db.query('select admin_org_grant($1,$2)', [actor, { org_id: orgId, kind: 'bank_grant', credits: 5000, request_id: 'bank:' + randomUUID() }])
  const staff = await createUser(db, { credits: own.credits ?? 0, freeCredits: own.free ?? 0 })
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [staff, orgId])
  if (paid) await db.query('select org_allocate($1,$2,$3,$4)', [owner, staff, paid, randomUUID()])
  if (promo) await db.query('select org_allocate_promo($1,$2,$3,$4)', [owner, staff, promo, randomUUID()])
  return { orgId, owner, staff }
}

// A 1k job of a template costing 10, with an optional choice and source.
const seed = async () => (template ??= await seedTemplate(db, { visibleIn: ['web', 'partner'], credits: { '1k': 10, '2k': 20, '3k': 30 } }))
async function generate(user: string, choice?: string, source = 'web') {
  await seed()
  const inputs = { resolution: '1k', attempt_id: randomUUID(), ...(choice ? { pool_choice: choice } : {}) }
  return row(db, "select credit_pool, visibility from reserve_credits($1,$2,'image',$3,10,$4,$5)", [randomUUID(), user, template, source, inputs]) as
    Promise<{ credit_pool: string; visibility: string }>
}
const balances = (user: string) => row(db, 'select credits, free_credits, org_pool_choice from profiles where id=$1', [user])

it('honours promo: the free pool, org promotion share first, a free work; and remembers it', async () => {
  const { orgId, staff } = await member(100, 100, { free: 50 })
  expect(await generate(staff, 'promo')).toMatchObject({ credit_pool: 'free' }) // a free work: watermarked (privacy: org works stamping)
  expect(await balances(staff)).toEqual({ credits: 100, free_credits: 140, org_pool_choice: 'promo' })
  expect(await row(db, 'select held_credits, held_promo_credits from org_members where org_id=$1 and user_id=$2', [orgId, staff]))
    .toEqual({ held_credits: 100, held_promo_credits: 90 })
})

it('honours paid: the org paid share pays the whole job, the member’s own credits stay untouched', async () => {
  const { orgId, staff } = await member(100, 100, { credits: 5 })
  expect(await generate(staff, 'paid')).toMatchObject({ credit_pool: 'paid' })
  expect(await balances(staff)).toEqual({ credits: 95, free_credits: 100, org_pool_choice: 'paid' })
  expect(await row(db, 'select held_credits, held_promo_credits from org_members where org_id=$1 and user_id=$2', [orgId, staff]))
    .toEqual({ held_credits: 90, held_promo_credits: 100 }) // own 5 still there
})

it('refuses a chosen kind that cannot cover the price, never falling back to the other kind', async () => {
  await seed() // outside the refused savepoints, which roll back
  const { staff } = await member(100, 5)
  await refused(db, () => generate(staff, 'promo'), 'POOL_CHOICE_INSUFFICIENT')
  const short = await member(5, 100)
  await refused(db, () => generate(short.staff, 'paid'), 'POOL_CHOICE_INSUFFICIENT')
  expect(await balances(staff)).toMatchObject({ credits: 100, free_credits: 5 })
  expect(await balances(short.staff)).toMatchObject({ credits: 5, free_credits: 100 })
  expect(await row(db, 'select count(*)::int n from generation_jobs where user_id in ($1,$2)', [staff, short.staff])).toEqual({ n: 0 })
})

it('ignores the choice with only one kind held, outside an org, and for partner calls: org paid first, then org promotion', async () => {
  const onlyPromo = await member(0, 100, { credits: 50 })
  expect(await generate(onlyPromo.staff, 'paid')).toMatchObject({ credit_pool: 'free' }) // the org promotion share, never own paid
  expect(await balances(onlyPromo.staff)).toMatchObject({ credits: 50, free_credits: 90 })
  const outsider = await createUser(db, { credits: 50, freeCredits: 50 })
  expect(await generate(outsider, 'promo')).toMatchObject({ credit_pool: 'paid' })
  const both = await member(100, 100)
  expect(await generate(both.staff, 'promo', 'graylum')).toMatchObject({ credit_pool: 'paid' })
  expect(await generate(both.staff)).toMatchObject({ credit_pool: 'paid' }) // no choice sent: as before
  expect((await balances(both.staff)).org_pool_choice).toBeNull()
  await refused(db, () => generate(both.staff, 'gift'), 'INVALID_INPUT') // template already seeded above
})

it('never charges an active member’s own credits: refuses when the org shares cannot cover the job', async () => {
  await seed()
  const { staff } = await member(0, 0, { credits: 500, free: 500 })
  await refused(db, () => generate(staff), 'ORG_CREDITS_INSUFFICIENT')
  const small = await member(5, 5, { credits: 500, free: 500 })
  await refused(db, () => generate(small.staff), 'ORG_CREDITS_INSUFFICIENT') // no mix of org and own either
  expect(await balances(staff)).toMatchObject({ credits: 500, free_credits: 500 })
  expect(await balances(small.staff)).toMatchObject({ credits: 505, free_credits: 505 })
  // Once they leave, their own credits are theirs to use again.
  await db.query("select org_leave($1,'leave-own')", [staff])
  expect(await generate(staff)).toMatchObject({ credit_pool: 'paid' })
  expect(await balances(staff)).toMatchObject({ credits: 490 })
})

it('holds the org owner to the same rule: org shares only, own credits frozen', async () => {
  await seed()
  const { owner } = await member(0, 0)
  await db.query('update profiles set credits=100, free_credits=100 where id=$1', [owner])
  await refused(db, () => generate(owner), 'ORG_CREDITS_INSUFFICIENT')
  await db.query("select org_allocate_promo($1,$1,40,'self-promo')", [owner])
  expect(await generate(owner)).toMatchObject({ credit_pool: 'free' })
  expect((await db.query('select credits, free_credits from profiles where id=$1', [owner])).rows[0]).toEqual({ credits: 100, free_credits: 130 })
})

it('charges poster photo extraction from the org shares too', async () => {
  await db.query("insert into system_settings(key, value) values ('poster_photo_credits', '1'::jsonb) on conflict (key) do update set value = excluded.value")
  const { orgId, staff } = await member(0, 50, { credits: 500 })
  expect(await row(db, "select credits from start_poster_photo($1,'test',10)", [staff])).toEqual({ credits: 1 })
  expect(await balances(staff)).toMatchObject({ credits: 500, free_credits: 49 })
  expect(await row(db, 'select held_promo_credits from org_members where org_id=$1 and user_id=$2', [orgId, staff])).toEqual({ held_promo_credits: 49 })
})

it('ignores the choice once the promotion month is over', async () => {
  const { orgId, staff } = await member(100, 100)
  await db.query("update orgs set promo_expires_at=now()-interval '1 second' where id=$1", [orgId])
  expect(await generate(staff, 'promo')).toMatchObject({ credit_pool: 'paid' })
})

it('keeps the helper private', async () => {
  expect(await row(db, `select has_function_privilege('service_role','public._reserve_pool(public.profiles,integer,text,text)','execute') s,
    has_function_privilege('authenticated','public._reserve_pool(public.profiles,integer,text,text)','execute') u`)).toEqual({ s: false, u: false })
})
