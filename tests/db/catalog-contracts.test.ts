import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { connectAdmin, createUser, profileOf } from './helpers'
import { seedCatalogPolicy } from './catalog-policy'

let db: Client
let user: string
beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await seedCatalogPolicy(db)
  user = await createUser(db)
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
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

const product = 'pro_monthly'
const key = 'pro_monthly_recurring_v2'
const bind = (revision: number, old: boolean) =>
  db.query('select admin.catalog_bind_prices($1,$2,$3,false,$4)', [
    product,
    revision,
    'acct_contract',
    {
      pro_monthly_v2: old ? 'price_OldOne' : 'price_NewOne',
      [key]: old ? 'price_OldRecurring' : 'price_NewRecurring',
    },
  ])
const attempt = (token: string, revision: number, cents: number, price: string, hash = 'same') =>
  db.query(
    `select public.lock_catalog_checkout($1,$2,$3,$4,$5,'stripe',$6,$7,$8,$8,null,'card','subscription',
    jsonb_build_object('expires_at',extract(epoch from now()+interval '1 hour')::int)) a`,
    [user, token, hash, product, revision, key, price, cents],
  )
const receipt = (
  token: string,
  revision: number,
  price: string,
  cents: number,
  credits: number,
  ref: string,
  renewal = false,
  net = cents,
  buyer = user,
  contract = 'sub_contract',
  record = true,
) =>
  db.query(`select public.catalog_receipt($1,$2,$3,$4,'stripe',$5,$6,$7,$8,$9,$10,$11,false,$12) terms`, [
    token,
    buyer,
    product,
    revision,
    price,
    cents,
    credits,
    ref,
    contract,
    renewal,
    net,
    record,
  ])

async function revise(revision: number, credits: number, cents: number) {
  await db.query(
    `insert into admin.catalog_product_versions(product_id,revision,usd_cents,credits,paid_days,listed,sort_order,name_en,name_zh)
    select product_id,$2,$3,$4,paid_days,listed,sort_order,name_en,name_zh from admin.catalog_product_versions
    where product_id=$1 and revision=2`,
    [product, revision, cents, credits],
  )
  await db.query('update admin.catalog_products set published_revision=$2 where product_id=$1', [product, revision])
}
const pay = (ref: string) =>
  db.query("select * from public.settle_checkout_v2($1,$2,$3,9900,'usd',0,'card')", [user, product, ref])
const renew = (ref: string, cents: number) =>
  db.query(
    `select * from public.apply_subscription_renewal_v2(
  $1,$2,$3,now()+interval '60 days',$4,'usd',0,'card')`,
    [user, product, ref, cents],
  )

it('pins the Price and credits across publication, retries, a delayed purchase and a duplicate renewal', async () => {
  const token = randomUUID()
  await db.query("insert into admin.catalog_stripe_environment(stripe_account,livemode) values('acct_contract',false)")
  await revise(3, 3333, 9900)
  await bind(3, false)
  await attempt(token, 3, 9900, 'price_NewRecurring')
  await db.query('select public.attach_catalog_session($1,$2,$3,$4)', [
    user,
    token,
    'cs_contract',
    'https://checkout.stripe.com/c/test',
  ])
  await revise(4, 4444, 10000)
  const retry = await attempt(token, 3, 9900, 'price_NewRecurring')
  expect(retry.rows[0].a.session_id).toBe('cs_contract')
  await rejects(() => attempt(token, 4, 10000, 'price_Other', 'different'), 'IDEMPOTENCY_CONFLICT')
  await rejects(() => attempt(randomUUID(), 3, 9900, 'price_NewRecurring'), 'CODE_CHECKOUT_OFFER_CHANGED')
  await rejects(() => receipt(token, 3, 'price_NewRecurring', 9900, 3333, 'cs_unrelated'), 'CATALOG_SESSION_MISMATCH')
  await rejects(() => receipt(token, 3, 'price_Other', 9900, 3333, 'cs_contract'), 'CATALOG_RECEIPT_MISMATCH')
  await rejects(
    () => receipt(token, 3, 'price_NewRecurring', 9900, 3333, 'cs_contract', false, 9899),
    'CATALOG_PAID_AMOUNT_MISMATCH',
  )
  await rejects(
    () => receipt(token, 3, 'price_NewRecurring', 9900, 3333, 'cs_contract', false, 9900, randomUUID()),
    'CATALOG_RECEIPT_MISMATCH',
  )
  await receipt(token, 3, 'price_NewRecurring', 9900, 3333, 'cs_contract', false, 9900, user, 'sub_contract', false)
  expect((await db.query('select * from admin.catalog_receipts where token=$1', [token])).rowCount).toBe(0)
  await receipt(token, 3, 'price_NewRecurring', 9900, 3333, 'cs_contract')
  expect((await pay('cs_contract')).rows[0].applied).toBe(true)
  await receipt(token, 3, 'price_NewRecurring', 9900, 3333, 'in_cycle', true)
  expect((await renew('in_cycle', 9900)).rows[0].applied).toBe(true)
  expect((await renew('in_cycle', 9900)).rows[0].applied).toBe(false)
  expect((await profileOf(db, user)).credits).toBe(6666)
})

it('lets a buyer who opened a catalog checkout delete the account, taking attempts, receipts and contracts with it', async () => {
  const token = randomUUID()
  await db.query("insert into admin.catalog_stripe_environment(stripe_account,livemode) values('acct_contract',false)")
  await revise(3, 3333, 9900)
  await bind(3, false)
  await attempt(token, 3, 9900, 'price_NewRecurring')
  await db.query('select public.attach_catalog_session($1,$2,$3,$4)', [user, token, 'cs_delete', 'https://checkout.stripe.com/c/test'])
  await receipt(token, 3, 'price_NewRecurring', 9900, 3333, 'cs_delete')
  expect((await pay('cs_delete')).rows[0].applied).toBe(true)
  const left = async () => (await db.query(`select (select count(*) from admin.catalog_checkout_attempts where token=$1)
    + (select count(*) from admin.catalog_receipts where token=$1) + (select count(*) from admin.catalog_contracts where token=$1) n`, [token])).rows[0].n
  expect(Number(await left())).toBe(3)
  await db.query('delete from auth.users where id=$1', [user])
  expect((await db.query('select id from public.profiles where id=$1', [user])).rowCount).toBe(0)
  expect(Number(await left())).toBe(0)
})

it('grandfathers the approved v2 contract and refuses unverified channels on later revisions', async () => {
  await db.query("insert into admin.catalog_stripe_environment(stripe_account,livemode) values('acct_contract',false)")
  await bind(2, true)
  expect(
    (await db.query("select public.catalog_legacy_price($1,$2,'price_OldRecurring') matched", [product, key])).rows[0].matched,
  ).toBe(true)
  await revise(3, 3333, 9900)
  await rejects(() => attempt(randomUUID(), 3, 9900, 'price_OldRecurring'), 'CATALOG_CHANNEL_UNVERIFIED')
  await rejects(
    () => db.query("select public.catalog_channel_price($1,3,'waffo','subscription',true,'sandbox','test')", [product]),
    'CATALOG_CHANNEL_UNVERIFIED',
  )
  const seed = (await db.query('select credits, usd_cents from admin.product_terms_v2 where product_id=$1', [product])).rows[0]
  expect((await renew('in_pre_catalog', seed.usd_cents)).rows[0].applied).toBe(true)
  expect((await profileOf(db, user)).credits).toBe(seed.credits)
})

it.each([
  ['pack_studio', 'one_time', null],
  ['studio_monthly', 'subscription', 'sub_studio'],
] as const)('grants a new %s while its legacy registry identity stays inactive', async (sku, form, contract) => {
  const token = randomUUID()
  const actor = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
  const draft = await db.query('select public.admin_catalog_save($1,$2,null,null,$3,$4) id', [
    actor,
    sku,
    {
      tier: contract ? 'pro' : 'pack',
      kind: contract ? 'monthly' : 'pack',
      name_en: 'Studio',
      name_zh: '影棚',
      benefit_en: 'Studio credits',
      benefit_zh: '影棚积分',
      credits: 333,
      usd_cents: 9900,
      sort_order: 80,
      listed: true,
    },
    '新增商品',
  ])
  const id = draft.rows[0].id
  const prices = { [sku + '_v2']: 'price_StudioOnce', ...(contract && { [sku + '_recurring_v2']: 'price_StudioCycle' }) }
  await db.query("select public.admin_catalog_prepare($1,$2,'acct_studio',false,'{}')", [actor, id])
  await db.query("select public.admin_catalog_publish($1,$2,'acct_studio',false,$3)", [actor, id, prices])
  expect((await db.query('select active from public.products where id=$1', [sku])).rows[0].active).toBe(false)
  const price = contract ? 'price_StudioCycle' : 'price_StudioOnce'
  const lookup = sku + (contract ? '_recurring_v2' : '_v2')
  await db.query(
    `select public.lock_catalog_checkout($1,$2,'test',$3,3,'stripe',$4,$5,9900,9900,null,'card',$6,
    jsonb_build_object('expires_at',extract(epoch from now()+interval '1 hour')::int))`,
    [user, token, sku, lookup, price, form],
  )
  const purchase = (ref: string) =>
    db.query("select * from public.settle_checkout_v2($1,$2,$3,9900,'usd',0,'card')", [user, sku, ref])
  await rejects(() => purchase('cs_unbound_studio'), 'PRODUCT_NOT_FOUND')
  const bindEvent = (ref: string, renewal: boolean) =>
    db.query(
      `select public.catalog_receipt($1,$2,$3,3,'stripe',$4,
    9900,333,$5,$6,$7,9900,false,true)`,
      [token, user, sku, price, ref, contract, renewal],
    )
  await bindEvent('cs_studio', false)
  expect((await purchase('cs_studio')).rows[0].applied).toBe(true)
  expect((await purchase('cs_studio')).rows[0].applied).toBe(false)
  if (contract) {
    await bindEvent('in_studio', true)
    const result = await db.query(
      `select * from public.apply_subscription_renewal_v2($1,$2,'in_studio',now()+interval '60 days',9900,'usd',0,'card')`,
      [user, sku],
    )
    expect(result.rows[0].applied).toBe(true)
  }
  expect((await profileOf(db, user)).credits).toBe(contract ? 666 : 333)
})

it('opens only one Waffo session and preserves its checked price and recurring grant on a delayed charge', async () => {
  const token = randomUUID()
  await revise(3, 3333, 9900)
  await db.query(`insert into admin.catalog_waffo_bindings values($1,3,'shop','test','PROD_once','PROD_cycle',9900)`, [product])
  await rejects(
    () => db.query("select public.catalog_channel_price($1,3,'waffo','subscription',true,'other-shop','test')", [product]),
    'CATALOG_CHANNEL_UNVERIFIED',
  )
  await db.query(
    `select public.lock_catalog_checkout($1,$2,'test',$3,3,'waffo','subscription','PROD_cycle',
    9900,9900,null,'card','subscription','{}','shop','test')`,
    [user, token, product],
  )
  const claim = () => db.query('select public.claim_waffo_catalog_session($1,$2) c', [user, token])
  expect((await claim()).rows[0].c).toEqual({ claimed: true })
  expect((await claim()).rows[0].c).toEqual({ pending: true })
  await db.query("select public.attach_catalog_session($1,$2,'cs_waffo','https://checkout.waffo.ai/test')", [user, token])
  expect((await claim()).rows[0].c).toEqual({ url: 'https://checkout.waffo.ai/test' })
  await revise(4, 4444, 10500)
  const bindEvent = (pay: string, renewal: boolean) =>
    db.query(
      `select public.catalog_receipt($1,$2,$3,3,'waffo','PROD_cycle',
    9900,3333,$4,'ORD_catalog',$5,null,false,true)`,
      [token, user, product, pay, renewal],
    )
  await bindEvent('PAY_first', false)
  await rejects(() => bindEvent('PAY_second_first', false), 'IDEMPOTENCY_CONFLICT')
  await db.query("select * from public.settle_waffo_order_v2($1,$2,'PAY_first','ORD_catalog',9900,'usd',0,'card')", [
    user,
    product,
  ])
  await bindEvent('PAY_cycle', true)
  const renewal = () =>
    db.query(`select public.settle_waffo_renewal_v2($1,$2,'ORD_catalog',2,'PAY_cycle',9900,9900,0,9900,'usd') c`, [user, product])
  expect((await renewal()).rows[0].c.outcome).toBe('applied')
  expect((await renewal()).rows[0].c.outcome).toBe('replayed')
  expect((await profileOf(db, user)).credits).toBe(6666)
})

it('preserves subscription coupon selection when its discount rounds to zero, leaving pack ties unused', async () => {
  const token = randomUUID()
  const code = randomUUID()
  await db.query(`insert into public.codes(id,kind,code,discount_percent,discount_products,discount_duration,stripe_coupon_id)
    values($1,'campaign','ROUND1',1,array['pro_monthly','pack_s'],'once','coupon_round')`, [code])
  await db.query(`insert into public.code_redemptions(code_id,kind,user_id,context,status,checkout_prepared,checkout_token,checkout_expires_at)
    values($1,'campaign',$2,'paywall','ok',true,$3,now()+interval '30 minutes')`, [code,user,token])
  const verify = (sku: string, percent: number | null) => db.query(
    "select admin.catalog_buyer_terms($1,$2,1,$3,'stripe',1,1,$4,$5)",
    [user,sku,token,percent,{ metadata: { code_id:code }, discounts: [{ coupon:'coupon_round' }] }])
  await verify(product,1)
  await rejects(() => verify(product,null),'CODE_CHECKOUT_OFFER_CHANGED')
  await verify('pack_s',null)
  await rejects(() => verify('pack_s',1),'CODE_CHECKOUT_OFFER_CHANGED')
})
