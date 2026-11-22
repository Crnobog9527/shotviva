import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { row } from './affiliate-fixtures'
import { seedCatalogPolicy } from './catalog-policy'
import { connectAdmin, createUser } from './helpers'

// The enterprise level-2 default per product kind (1900, ARCHITECTURE §6.5): affiliate_rates.org_l2_bp
// starts at pack 5%, monthly 5%, yearly 3%, and admin_affiliate_settings saves it (admins only,
// audited). The snapshot side is in org-affiliate-l2.test.ts.

let db: Client
let actor: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const save = (who: string, input: object) => db.query('select admin_affiliate_settings($1,$2)', [who, input])
const defaults = async () =>
  Object.fromEntries((await db.query('select product_kind,l1_bp,l2_bp,org_l2_bp from affiliate_rates order by product_kind')).rows
    .map((r) => [r.product_kind, [r.l1_bp, r.l2_bp, r.org_l2_bp]]))
const rates = (org: Record<string, number | undefined>) => ['pack', 'monthly', 'yearly'].map((kind) => ({
  product_kind: kind, l1_bp: kind === 'yearly' ? 1000 : 1500, l2_bp: kind === 'yearly' ? 300 : 500,
  ...(org[kind] === undefined ? {} : { org_l2_bp: org[kind] }),
}))

it('starts at pack 5%, monthly 5%, yearly 3%, beside unchanged level-1 rates and team bonus', async () => {
  expect(await defaults()).toEqual({ monthly: [1500, 500, 500], pack: [1500, 500, 500], yearly: [1000, 300, 300] })
})

it('saves the three org level-2 defaults from the settings form and audits the save', async () => {
  await save(actor, { hold_days: 30, rates: rates({ pack: 450, monthly: 550, yearly: 250 }) })
  expect(await defaults()).toEqual({ monthly: [1500, 500, 550], pack: [1500, 500, 450], yearly: [1000, 300, 250] })
  const audit = await row(db, "select reason from admin_audit_log where action='affiliate_settings' and user_id=$1", [actor])
  expect(JSON.parse(audit.reason).rates).toContainEqual(expect.objectContaining({ product_kind: 'yearly', org_l2_bp: 250 }))
})

it('leaves the org defaults alone when the form deployed before 1900 sends rates without them', async () => {
  await save(actor, { rates: rates({ yearly: 250 }) })
  await save(actor, { rates: rates({}).map((r) => ({ ...r, l1_bp: r.l1_bp + 100 })) })
  expect(await defaults()).toEqual({ monthly: [1600, 500, 500], pack: [1600, 500, 500], yearly: [1100, 300, 250] })
})

it('refuses a rate above 100% and a non-admin, changing nothing', async () => {
  await db.query('savepoint refused')
  await expect(save(actor, { rates: rates({ yearly: 10001 }) })).rejects.toThrow('check')
  await db.query('rollback to savepoint refused')
  const user = await createUser(db)
  await expect(save(user, { rates: rates({ yearly: 100 }) })).rejects.toThrow('NOT_ADMIN')
  await db.query('rollback to savepoint refused')
  expect((await defaults()).yearly).toEqual([1000, 300, 300])
  expect(await row(db, "select count(*)::int n from admin_audit_log where action='affiliate_settings' and user_id=$1", [user])).toEqual({ n: 0 })
})

it('counts the enterprise level-2 defaults and an org account\'s own level-2 rate in the break-even fee', async () => {
  await seedCatalogPolicy(db)
  const fee = async (kind: string) => (await row(db, 'select (admin.catalog_fee_components($1)->>\'commission_bp\')::int c', [kind])).c
  // Policy 13.01% yearly / 20.01% otherwise is above every default rate.
  expect([await fee('pack'), await fee('monthly'), await fee('yearly')]).toEqual([2001, 2001, 1301])
  await save(actor, { rates: rates({ pack: 450, monthly: 550, yearly: 4500 }) })
  expect(await fee('yearly')).toBe(4500)
  expect(await fee('pack')).toBe(2001)
  // An active org account's own level-2 override counts too.
  const owner = await createUser(db)
  await db.query('select admin_org_create($1,$2)', [actor, { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }])
  await db.query('select admin_affiliate_set($1,$2)', [actor, { user_id: owner, overrides: [{ product_kind: 'pack', l1_bp: null, l2_bp: 7000 }] }])
  expect(await fee('pack')).toBe(7000)
  expect(await fee('monthly')).toBe(2001)
})
