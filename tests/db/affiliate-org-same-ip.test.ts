import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { bind, commission, promoter, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// Migration 1844: enterprise affiliates (affiliates.org_id is not null) are exempt from the
// same_ip commission flag; personal affiliates keep it. Each test runs in a transaction that is
// rolled back.

let db: Client
let actor: string
const IP = '203.0.113.50'
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const sameIp = (ids: string[]) => db.query('update profiles set signup_ip=$2 where id=any($1::uuid[])', [ids, IP])

// An org whose affiliate switch is on, plus a customer attributed to it at level 1.
async function orgCustomer() {
  const owner = await createUser(db)
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }
  await db.query('select admin_org_create($1,$2)', [actor, input])
  const customer = await createUser(db)
  await db.query("update profiles set referred_by=$2,referred_source='org_l1',referred_at=now() where id=$1", [customer, owner])
  return { owner, customer }
}

it('an enterprise affiliate whose payer shares its signup IP gets no same_ip flag and stays pending', async () => {
  const { owner, customer } = await orgCustomer()
  expect(await row(db, 'select org_id is not null as org from affiliates where user_id=$1', [owner])).toEqual({ org: true })
  await sameIp([owner, customer])
  const p = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, p.id)).toMatchObject({ status: 'pending', flags: [] })
  // Refund and recompute paths are unchanged: the row is voided like any other, still unflagged.
  await refund(db, p.charge, 2490)
  expect(await commission(db, p.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'refunded', flags: [] })
})

it('a personal affiliate whose payer shares its signup IP is still flagged and held', async () => {
  const owner = await promoter(db)
  const buyer = await createUser(db)
  await bind(db, buyer, owner.slug)
  await sameIp([owner.id, buyer])
  const p = await sale(db, buyer, 'pack_m', 2490)
  const held = await commission(db, p.id)
  expect(held).toMatchObject({ status: 'on_hold', flags: ['same_ip'] })
  await refund(db, p.charge, 2490)
  expect(await commission(db, p.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'refunded' })
})

it('level 2 follows the level-1 referrer: a personal parent of a flagged personal child is held, of an org child is not', async () => {
  const parent = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [parent.id])
  const child = await promoter(db, parent.id)
  const buyer = await createUser(db)
  await bind(db, buyer, child.slug)
  await sameIp([child.id, buyer])
  const p = await sale(db, buyer, 'pack_m', 2490)
  expect(await commission(db, p.id, 1)).toMatchObject({ status: 'on_hold', flags: ['same_ip'] })
  expect(await commission(db, p.id, 2)).toMatchObject({ status: 'on_hold', flags: ['same_ip'] })

  // An org account that has a personal parent: neither row of its payment is flagged.
  const { owner, customer } = await orgCustomer()
  await db.query('update affiliates set parent_user_id=$2 where user_id=$1', [owner, parent.id])
  await sameIp([owner, customer])
  const q = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, q.id, 1)).toMatchObject({ status: 'pending', flags: [] })
  expect(await commission(db, q.id, 2)).toMatchObject({ status: 'pending', flags: [] })
})
