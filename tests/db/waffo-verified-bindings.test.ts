import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { seedCatalogPolicy } from './catalog-policy'
import { connectAdmin, createUser } from './helpers'

// Migration 1567: the Waffo channel lists and sells a version only once it is bound for this
// store and mode at the version's price (ARCHITECTURE §6.3); seeded revisions no longer skip it.
let db: Client
let admin: string
beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await seedCatalogPolicy(db)
  admin = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
})
afterEach(async () => {
  await db.query('rollback')
  await db.end()
})

async function rejects(f: () => Promise<unknown>, error: string) {
  await db.query('savepoint failure')
  await expect(f()).rejects.toThrow(error)
  await db.query('rollback to failure')
}

const offers = async (store = 'STO_shop', mode = 'test') =>
  (await db.query("select product_id from public.read_waffo_offers('v2',$1,$2)", [store, mode])).rows.map(r => r.product_id)
const seeded = (actor: string, product: string, revision: number, once: string, recurring: string | null, store = 'STO_shop') =>
  db.query("select public.admin_catalog_waffo_seeded($1,$2,$3,$4,'test',$5,$6)", [actor, product, revision, store, once, recurring])
const price = (product: string, recurring: boolean, store = 'STO_shop') =>
  db.query("select public.catalog_channel_price($1,2,'waffo','k',$2,$3,'test') id", [product, recurring, store])

it('hides and refuses seeded versions on the Waffo channel until they are bound', async () => {
  expect((await db.query("select count(*)::int n from public.read_catalog_offers('v2')")).rows[0].n).toBeGreaterThan(0)
  expect(await offers()).toEqual([])
  await rejects(() => price('pro_monthly', true), 'CATALOG_CHANNEL_UNVERIFIED')
  // Stripe keeps its seeded mapping path.
  expect((await db.query("select public.catalog_channel_price('pro_monthly',2,'stripe','pro_monthly_v2',false) id")).rows[0].id).toBeNull()
})

it('binds a reviewed seeded version for one store and mode only', async () => {
  const other = await createUser(db)
  await rejects(() => seeded(other, 'pro_monthly', 2, 'PROD_once', 'PROD_cycle'), 'NOT_ADMIN')
  await seeded(admin, 'pro_monthly', 2, 'PROD_once', 'PROD_cycle')
  await seeded(admin, 'pack_s', 2, 'PROD_pack', null)
  expect((await offers()).sort()).toEqual(['pack_s', 'pro_monthly'])
  expect(await offers('STO_other')).toEqual([])
  expect(await offers('STO_shop', 'prod')).toEqual([])
  expect((await price('pro_monthly', true)).rows[0].id).toBe('PROD_cycle')
  expect((await price('pro_monthly', false)).rows[0].id).toBe('PROD_once')
  await rejects(() => price('pro_monthly', true, 'STO_other'), 'CATALOG_CHANNEL_UNVERIFIED')
  const audit = await db.query("select reason from public.admin_audit_log where action='catalog_waffo' and target_id='pro_monthly'")
  expect(JSON.parse(audit.rows[0].reason)).toMatchObject({ revision: 2, seeded: true })
  // A repeat with the same products is a no-op; different ones conflict.
  await seeded(admin, 'pro_monthly', 2, 'PROD_once', 'PROD_cycle')
  await rejects(() => seeded(admin, 'pro_monthly', 2, 'PROD_other', 'PROD_cycle'), 'CATALOG_BINDING_CONFLICT')
})

it('rejects inputs that do not match the version or reuse another contract', async () => {
  await rejects(() => seeded(admin, 'pro_monthly', 2, 'PROD_once', null), 'INVALID_INPUT')
  await rejects(() => seeded(admin, 'pack_s', 2, 'PROD_pack', 'PROD_cycle'), 'INVALID_INPUT')
  await rejects(() => seeded(admin, 'pro_monthly', 2, 'PROD_once', 'PROD_cycle', 'shop'), 'INVALID_INPUT')
  await rejects(() => seeded(admin, 'pro_monthly', 3, 'PROD_once', 'PROD_cycle'), 'CATALOG_STALE')
  await seeded(admin, 'pro_monthly', 2, 'PROD_once', 'PROD_cycle')
  await rejects(() => seeded(admin, 'starter_monthly', 2, 'PROD_two', 'PROD_cycle'), 'CATALOG_WAFFO_LEGACY_CONTRACT')
})

it('does not list a binding whose recorded price differs from the version', async () => {
  await seeded(admin, 'pack_s', 2, 'PROD_pack', null)
  await db.query("update admin.catalog_waffo_bindings set usd_cents=usd_cents+1 where product_id='pack_s'")
  expect(await offers()).toEqual([])
  await rejects(() => price('pack_s', false), 'CATALOG_CHANNEL_UNVERIFIED')
})
