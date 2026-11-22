import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { connectAdmin } from './helpers'
import { adminActor, confirm, months, partner, refused, run, sheet } from './partner-promo-fixtures'

// The owner's read-only card of this month's promotion credits (migration 1849): granted = the
// confirmed monthly sheet + top-ups, expiry = month end, remaining = what the expiry would take now.
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

type Month = { promo_partner: boolean; period: string; monthly: number; topups: number; expires_at: Date | null; remaining: number }
const month = async (orgId: string) => (await db.query('select * from org_promo_month($1)', [orgId])).rows[0] as Month | undefined
const topup = (orgId: string, owner: string, credits: number) =>
  db.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits, reason: 'launch', request_key: randomUUID() }])
async function spend(user: string, amount: number) {
  const key = randomUUID() + ':reserve'
  await db.query("select _apply_credit_change($1,'free','reserve',$2,'job',$3)", [user, -amount, key])
}

it('sums the confirmed monthly sheet and the top-ups, and counts down what the owner spent', async () => {
  const { orgId, owner } = await partner(db, actor)
  expect(await month(orgId)).toMatchObject({ promo_partner: true, period: m.current, monthly: 0, topups: 0, expires_at: null, remaining: 0 })

  // A pending sheet is not granted yet.
  await run(db, m.current)
  expect(await month(orgId)).toMatchObject({ monthly: 0, remaining: 0 })
  expect(await confirm(db, actor, await sheet(db, orgId, m.current))).toMatchObject({ applied: true, total: 10000 })
  await topup(orgId, owner, 2000)
  const now = await month(orgId)
  expect(now).toMatchObject({ monthly: 10000, topups: 2000, remaining: 12000 })
  const { month_end } = await row(db, "select (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC' as month_end")
  expect(now?.expires_at).toEqual(month_end)

  await spend(owner, 3500)
  expect(await month(orgId)).toMatchObject({ remaining: 8500 })
})

it('never shows more than the free balance, nor another org\'s credits; a plain org is not a partner', async () => {
  const a = await partner(db, actor)
  const b = await partner(db, actor)
  await topup(a.orgId, a.owner, 4000)
  await topup(b.orgId, b.owner, 9000)
  expect(await month(a.orgId)).toMatchObject({ topups: 4000, remaining: 4000 })
  await db.query('update profiles set free_credits=1500 where id=$1', [a.owner])
  expect(await month(a.orgId)).toMatchObject({ remaining: 1500 })
  expect(await month(b.orgId)).toMatchObject({ topups: 9000, remaining: 9000 })

  const plain = await partner(db, actor, false)
  expect(await month(plain.orgId)).toMatchObject({ promo_partner: false, monthly: 0, topups: 0, remaining: 0 })
  expect(await month(randomUUID())).toBeUndefined()
})

it('is callable by the service role only', async () => {
  const { orgId } = await partner(db, actor)
  for (const role of ['anon', 'authenticated']) {
    await db.query(`set local role ${role}`)
    await refused(db, () => month(orgId), 'permission denied')
    await db.query('reset role')
  }
  await db.query('set local role service_role')
  expect(await month(orgId)).toMatchObject({ promo_partner: true })
  await db.query('reset role')
})
