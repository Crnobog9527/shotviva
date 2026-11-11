import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { publishedOffers } from '@/core/billing/product-catalog'
import { saveCampaignWithCoupon } from '@/core/codes/campaign-coupon'
import { seedCatalogPolicy } from './catalog-policy'
import { localSupabase } from './helpers'

// The real admin save path (admin/codes/save.ts → saveCampaignWithCoupon → saveCode →
// admin_save_code → _validate_code_discount) with the v2 catalog live. 1127 broke it with a
// plpgsql variable named like a catalog column ("cents" is ambiguous); 1174 renames them.
// Only the Stripe coupon client is a stand-in: everything else is the local database.
const { apiUrl, serviceRoleKey, dbUrl } = localSupabase()
const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const db = new Client({ connectionString: dbUrl })
const coupons = () => ({
  create: async (params: { id?: string }) => ({ id: params.id ?? 'coupon_test' }),
  retrieve: async () => { throw new Error('not used') },
}) as never

let actor = ''
let previous: { key: string; value: unknown }[] = []
const codes: string[] = []

beforeAll(async () => {
  await db.connect()
  previous = (await db.query("select key,value from public.system_settings where key in ('pricing_catalog_version','catalog_economics_policy')")).rows
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  await seedCatalogPolicy(db)
  const { data, error } = await admin.auth.admin.createUser({ email: `codes-${randomUUID()}@example.test`, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser returned no user')
  actor = data.user.id
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
})

afterAll(async () => {
  if (codes.length) await db.query('delete from public.codes where id = any($1::uuid[])', [codes])
  await db.query("delete from public.system_settings where key in ('pricing_catalog_version','catalog_economics_policy')")
  for (const row of previous) await db.query('insert into public.system_settings(key,value) values($1,$2)', [row.key, JSON.stringify(row.value)])
  if (actor) await admin.auth.admin.deleteUser(actor)
  await db.end()
})

async function save(id: string, fields: Record<string, unknown>) {
  const products = await publishedOffers(admin, 'v2')
  return saveCampaignWithCoupon(admin, actor, id, fields, products, coupons)
}

const campaign = (code: string, product: string) => ({
  code, note: 'T105 1174', discount_percent: 15, discount_products: [product], discount_duration: 'once',
  discount_months: null, discount_valid_days: 1, max_redemptions: 1, new_users_only: false, active: true,
})

it('creates and then edits a campaign code on the v2 catalog through the admin save path', async () => {
  const id = randomUUID()
  codes.push(id)
  expect(await save(id, campaign(`QA${id.slice(0, 6).toUpperCase()}`, 'pack_s'))).toBe(id)
  const created = (await db.query('select discount_percent,discount_products,stripe_coupon_id,active from public.codes where id=$1', [id])).rows[0]
  expect(created).toMatchObject({ discount_percent: 15, discount_products: ['pack_s'], active: true })
  expect(created.stripe_coupon_id).toMatch(/^sv_/)

  await save(id, { note: 'edited', active: false })
  expect((await db.query('select note,active from public.codes where id=$1', [id])).rows[0]).toEqual({ note: 'edited', active: false })
  await expect(save(id, { discount_percent: 20 })).rejects.toThrow()
})

it('accepts 15% on the $19.90 Starter plan, a half-cent discount (1990 × 15% = 298.5)', async () => {
  const id = randomUUID()
  codes.push(id)
  await save(id, campaign(`QB${id.slice(0, 6).toUpperCase()}`, 'starter_monthly'))
  const { rows } = await db.query(`select v.usd_cents,v.revision from admin.catalog_products p
    join admin.catalog_product_versions v on (v.product_id,v.revision)=(p.product_id,p.published_revision) where p.product_id='starter_monthly'`)
  expect(rows[0].usd_cents).toBe(1990)
  // 298.5 off rounds to 1691 or 1692 to pay; the checkout floor accepts either cent. The exact
  // amount Stripe charges is checked end to end on the test site (Validation handoff).
  for (const net of [1691, 1692]) {
    await db.query("select admin.assert_catalog_checkout('starter_monthly',$1,$2,15)", [rows[0].revision, net])
  }
})
