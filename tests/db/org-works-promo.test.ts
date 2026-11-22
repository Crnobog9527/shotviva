import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner } from './partner-promo-fixtures'

// 企业作品 funded by the org's promotion share (#836, org_promo_draws): the stamp trigger (1941,
// recreated in 1970) looks the draw up as it does org_held_draws, so such a work is an org work
// like a paid one: stamped, never public (even though it is a free-pool work), listed for the
// owner, cut off when the maker leaves. Each test runs in a transaction that is rolled back.

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

// A partner org with promotion credits in its pool and a member holding `share` of them.
async function promoOrg(share: number) {
  const p = await partner(db, actor)
  await db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: p.orgId, recipient: p.owner, period: m.current, credits: 1000, reason: 'test', request_key: randomUUID() }])
  const staff = await createUser(db)
  const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [p.orgId])
  await db.query('select org_join($1,$2)', [staff, invite_token])
  if (share) await db.query('select org_allocate_promo($1,$2,$3,$4)', [p.owner, staff, share, randomUUID()])
  return { ...p, staff }
}

async function generate(user: string, template: string) {
  const job = randomUUID()
  await db.query("select reserve_credits($1,$2,'image',$3,10,'web',$4,null,null,'public')",
    [job, user, template, { resolution: '1k', attempt_id: randomUUID() }])
  await db.query('select confirm_job($1,$2)', [job, `outputs/${user}/${job}.png`])
  return job
}
const jobRow = (id: string) =>
  row(db, 'select org_id, credit_pool, visibility, gallery_excluded, org_access_ended_at from generation_jobs where id=$1', [id])

it('stamps a work paid from the org promotion share and keeps it private', async () => {
  const template = await seedTemplate(db, { credits: { '1k': 10, '2k': 20, '3k': 30 } })
  const { orgId, owner, staff } = await promoOrg(20)
  const job = await generate(staff, template)
  expect(await row(db, 'select drawn from org_promo_draws where debit_key=$1', ['job:' + job + ':reserve'])).toEqual({ drawn: 10 })
  expect(await jobRow(job)).toMatchObject({ org_id: orgId, credit_pool: 'free', visibility: 'private', gallery_excluded: true, org_access_ended_at: null })
  await expect(db.query("update generation_jobs set visibility='public' where id=$1", [job])).resolves.toBeDefined()
  expect((await jobRow(job)).visibility).toBe('private')
  const listed = await db.query('select id, user_id from org_owner_work_list($1)', [owner])
  expect(listed.rows).toEqual([{ id: job, user_id: staff }])
})

it('cuts a promotion-funded org work off when its maker leaves', async () => {
  const template = await seedTemplate(db, { credits: { '1k': 10, '2k': 20, '3k': 30 } })
  const { owner, staff } = await promoOrg(20)
  const job = await generate(staff, template)
  await db.query('select org_remove_member($1,$2,$3)', [owner, staff, randomUUID()])
  expect((await jobRow(job)).org_access_ended_at).not.toBeNull()
})

it('leaves a free work from the member’s own free credits personal', async () => {
  const template = await seedTemplate(db, { credits: { '1k': 10, '2k': 20, '3k': 30 } })
  const { staff } = await promoOrg(0)
  await db.query('update profiles set free_credits=50 where id=$1', [staff])
  const job = await generate(staff, template)
  expect(await jobRow(job)).toMatchObject({ org_id: null, credit_pool: 'free', visibility: 'public' })
})
