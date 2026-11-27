import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner, refused } from './partner-promo-fixtures'

// 在职成员只用企业积分 (ARCHITECTURE §6.5, migrations 1896–1897): an active member pays only from the
// org's shares. Since 1996 the tier picks which share pays a web job (1K the promotion share, 2K /
// 4K the paid share) and the member's choice no longer does; tier-decides-pool.test.ts covers that.
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

// A job of a template costing 10 / 20 / 30 (1k / 2k / 4k), 1k by default, with an optional choice and source.
const PRICE = { '1k': 10, '2k': 20 } as const
const seed = async () => (template ??= await seedTemplate(db, { visibleIn: ['web', 'partner'], credits: { '1k': 10, '2k': 20, '3k': 30 } }))
async function generate(user: string, choice?: string, source = 'web', visibility: string | null = null, tier: keyof typeof PRICE = '1k') {
  await seed()
  const inputs = { resolution: tier, attempt_id: randomUUID(), ...(choice ? { pool_choice: choice } : {}) }
  return row(db, "select credit_pool, visibility, gallery_excluded, org_id from reserve_credits($1,$2,'image',$3,$4,$5,$6,null,null,$7)",
    [randomUUID(), user, template, PRICE[tier], source, inputs, visibility]) as Promise<{ credit_pool: string; visibility: string; gallery_excluded: boolean; org_id: string | null }>
}
const balances = (user: string) => row(db, 'select credits, free_credits, org_pool_choice from profiles where id=$1', [user])

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
  expect(await generate(staff, undefined, 'web', null, '2k')).toMatchObject({ credit_pool: 'paid' })
  expect(await balances(staff)).toMatchObject({ credits: 480 })
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

it('lets the owner deposit their own (frozen) paid credits into the pool, then use them as an org share', async () => {
  await seed()
  const { orgId, owner } = await member(0, 0)
  await db.query('update profiles set credits=300 where id=$1', [owner]) // bought on their own account
  await refused(db, () => generate(owner), 'ORG_CREDITS_INSUFFICIENT')
  const pool = Number((await row(db, 'select pool_credits from orgs where id=$1', [orgId])).pool_credits)
  expect((await row(db, "select org_deposit($1,300,'dep-own') r", [owner])).r).toMatchObject({ applied: true, pool_credits: pool + 300 })
  expect(await balances(owner)).toMatchObject({ credits: 0 })
  await db.query("select org_allocate($1,$1,50,'self-paid')", [owner])
  expect(await generate(owner, undefined, 'web', null, '2k')).toMatchObject({ credit_pool: 'paid' })
  expect(await balances(owner)).toMatchObject({ credits: 30 })
})

it('makes every org-funded work private and out of the gallery, promotion-funded ones included, whatever visibility was asked', async () => {
  const { orgId, staff } = await member(100, 100)
  expect(await generate(staff, 'promo', 'web', 'public')).toEqual({ credit_pool: 'free', visibility: 'private', gallery_excluded: true, org_id: orgId })
  expect(await generate(staff, 'paid', 'web', 'public', '2k')).toEqual({ credit_pool: 'paid', visibility: 'private', gallery_excluded: true, org_id: orgId })
  const outsider = await createUser(db, { freeCredits: 50 })
  expect(await generate(outsider)).toMatchObject({ credit_pool: 'free', visibility: 'public', org_id: null }) // a personal free work, as before
})

it('charges poster photo extraction from the org shares too', async () => {
  await db.query("insert into system_settings(key, value) values ('poster_photo_credits', '1'::jsonb) on conflict (key) do update set value = excluded.value")
  const { orgId, staff } = await member(0, 50, { credits: 500 })
  expect(await row(db, "select credits from start_poster_photo($1,'test',10)", [staff])).toEqual({ credits: 1 })
  expect(await balances(staff)).toMatchObject({ credits: 500, free_credits: 49 })
  expect(await row(db, 'select held_promo_credits from org_members where org_id=$1 and user_id=$2', [orgId, staff])).toEqual({ held_promo_credits: 49 })
})

it('refuses 1K once the promotion month is over, while 2K still pays from the paid share', async () => {
  await seed()
  const { orgId, staff } = await member(100, 100)
  await db.query("update orgs set promo_expires_at=now()-interval '1 second' where id=$1", [orgId])
  await refused(db, () => generate(staff, 'promo'), 'ORG_CREDITS_INSUFFICIENT')
  expect(await generate(staff, 'promo', 'web', null, '2k')).toMatchObject({ credit_pool: 'paid' })
})

it('keeps the helper private', async () => {
  expect(await row(db, `select has_function_privilege('service_role','public._reserve_pool(public.profiles,integer,text,text)','execute') s,
    has_function_privilege('authenticated','public._reserve_pool(public.profiles,integer,text,text)','execute') u`)).toEqual({ s: false, u: false })
})
