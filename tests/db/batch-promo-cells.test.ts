import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner, refused } from './partner-promo-fixtures'

// Batch create with promotion credits (Owner 2026-11-28, migration 2036): reserve_batch_cell lets a
// 1K (free-pool) cell through only for an active member of an active org with the affiliate
// program on, paid from the org's promotion share. Everyone else keeps the paid-only batch: a
// plain account's free credits never pay a batch cell.
let db: Client
let actor: string
let template: string
let m: Awaited<ReturnType<typeof months>>
const PRICE = { '1k': 10, '2k': 20 } as const
type Tier = keyof typeof PRICE
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await adminActor(db)
  m = await months(db)
  template = await seedTemplate(db, { visibleIn: ['web'], credits: { '1k': PRICE['1k'], '2k': PRICE['2k'], '3k': 30 } })
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

function cell(user: string, tier: Tier) {
  const inputs = { resolution: tier, attempt_id: randomUUID(), batch_id: randomUUID(), batch_position: 1, batch_size: 2, batch_templates: 1 }
  return row(db, "select credit_pool, credits_cost, batch_id from reserve_batch_cell($1,$2,'image',$3,$4,$5,null,null)",
    [randomUUID(), user, template, PRICE[tier], inputs]) as Promise<{ credit_pool: string; credits_cost: number; batch_id: string }>
}
const jobs = async (user: string) => Number((await row(db, 'select count(*) n from generation_jobs where user_id=$1', [user])).n)
const seat = (orgId: string, user: string) => row(db, 'select held_credits, held_promo_credits from org_members where org_id=$1 and user_id=$2', [orgId, user])

// An affiliate org (both pools filled) and one member holding 100 paid and 100 promotion credits.
async function member(ownFree = 0) {
  const { orgId, owner } = await partner(db, actor)
  await db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits: 5000, reason: 't', request_key: randomUUID() }])
  await db.query('select admin_org_grant($1,$2)', [actor, { org_id: orgId, kind: 'bank_grant', credits: 5000, request_id: 'bank:' + randomUUID() }])
  const staff = await createUser(db, { freeCredits: ownFree })
  await db.query('select org_join($1,(select invite_token from orgs where id=$2))', [staff, orgId])
  await db.query('select org_allocate($1,$2,$3,$4)', [owner, staff, 100, randomUUID()])
  await db.query('select org_allocate_promo($1,$2,$3,$4)', [owner, staff, 100, randomUUID()])
  return { orgId, staff }
}

it('refuses a 1K batch cell paid from a plain account’s free credits, charging nothing', async () => {
  const user = await createUser(db, { credits: 500, freeCredits: 500 })
  await refused(db, () => cell(user, '1k'), 'CREDITS_INSUFFICIENT')
  expect(await row(db, 'select credits, free_credits from profiles where id=$1', [user])).toMatchObject({ credits: 500, free_credits: 500 })
  expect(await jobs(user)).toBe(0)
  expect(await cell(user, '2k')).toMatchObject({ credit_pool: 'paid', credits_cost: PRICE['2k'] })
})

it('pays an affiliate org member’s 1K batch cell from the promotion share and 2K from the paid share', async () => {
  const { orgId, staff } = await member()
  expect(await cell(staff, '1k')).toMatchObject({ credit_pool: 'free', credits_cost: PRICE['1k'] })
  expect(await cell(staff, '2k')).toMatchObject({ credit_pool: 'paid', credits_cost: PRICE['2k'] })
  expect(await seat(orgId, staff)).toMatchObject({ held_credits: 80, held_promo_credits: 90 })
})

// With the workspace off a seat's 1K could draw the member's own free credits (2034), which a
// batch never takes: refused, nothing charged, own credits untouched.
it('refuses the 1K batch cell once the org turns the affiliate program off, or its workspace off', async () => {
  const { orgId, staff } = await member(500)
  await db.query('update orgs set affiliate_enabled=false where id=$1', [orgId])
  await refused(db, () => cell(staff, '1k'), 'CREDITS_INSUFFICIENT')
  expect(await seat(orgId, staff)).toMatchObject({ held_credits: 100, held_promo_credits: 100 })
  await db.query('update orgs set affiliate_enabled=true, status=$2 where id=$1', [orgId, 'suspended'])
  await refused(db, () => cell(staff, '1k'), 'CREDITS_INSUFFICIENT')
  expect(await jobs(staff)).toBe(0)
  expect(await row(db, 'select free_credits from profiles where id=$1', [staff])).toMatchObject({ free_credits: 600 })
})
