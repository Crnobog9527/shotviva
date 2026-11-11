import type Stripe from 'stripe'
import { expect, it, vi } from 'vitest'
import { STRIPE_TAX_CODE } from '../../billing/stripe/catalog'
import type { Editor } from './model'
import { newBindings, oldBindings, verifyAccount } from './stripe-review'

const account = 'acct_Sandbox'
const request = 'abb4277a-49c3-4dfd-b250-0dfba08b55b3'
const terms = { revision: 2, usd_cents: 1241, credits: 1241, listed: true, sort_order: 1,
  name_en: 'S',name_zh: '小包',benefit_en: '',benefit_zh: '' }
const item = { product_id: 'pack_s',tier:'pack',kind:'pack',bindings:{},waffo:null,budget:.009,fees:{payment_bp:100,refund_bp:20,commission_bp:50},discounts:[],history:[],current:terms,draft:{...terms,revision:3,usd_cents:1937},
  request:{id:request,status:'prepared',reason:'test',revision:3,base_revision:2,actor_id:request,last_error:null,created_at:'',stripe_account:account,livemode:false} } satisfies Editor
function object(id: string, cents: number) {
  return { id, active: true, livemode:false, type:'one_time',recurring:null,lookup_key:'pack_s_v2',unit_amount:cents,
    unit_amount_decimal:String(cents),currency:'usd',billing_scheme:'per_unit',tax_behavior:'exclusive',
    metadata:{product_id:'pack_s',catalog_publication_id:request},product:{id:'shotviva_pack_s',metadata:{tier:'pack'},active:true,livemode:false,tax_code:STRIPE_TAX_CODE} }
}
function read(price: ReturnType<typeof object>) {
  return { accounts: { retrieve:vi.fn(async () => ({id:account})) },prices:{ list:vi.fn(async () => ({data:[price]})),retrieve:vi.fn(async () => price) } } as unknown as Pick<Stripe,'accounts'|'prices'>
}
const form = () => { const f = new FormData(); f.set('pack_s_v2','price_New'); return f }

it('re-reads a named replacement and its Product, without allowing an account or Price ID mix-up', async () => {
  const old = read(object('price_Old',1241))
  await expect(verifyAccount(old,'acct_Other')).rejects.toThrow('stripe_account')
  expect(await oldBindings(old,item,false)).toEqual({pack_s_v2:'price_Old'})
  const stripe = read(object('price_New',1937))
  expect(await newBindings(stripe,item,form(),false)).toEqual({pack_s_v2:'price_New'})
  const other = form(); other.set('pack_s_v2','price_Unknown')
  await expect(newBindings(stripe,item,other,false)).rejects.toThrow('price_id')
  expect(stripe.prices.retrieve).toHaveBeenCalledWith('price_New',{expand:['product']})
})
it.each([
  ['live environment',{livemode:true}],['wrong amount',{unit_amount:1241}],['wrong tax',{tax_behavior:'inclusive'}],
  ['different publication',{metadata:{product_id:'pack_s',catalog_publication_id:'other'}}],
  ['wrong product',{product:{...object('x',1).product,id:'shotviva_pack_l'}}],['wrong cadence',{type:'recurring'}],
])('blocks %s before publication', async (_name, delta) => {
  const stripe = read({...object('price_New',1937),...delta as object})
  await expect(newBindings(stripe,item,form(),false)).rejects.toThrow()
})

it('checks the public and three member Prices and rejects one incomplete transfer', async () => {
  const sku = 'pack_m'
  const pack: Editor = { ...item, product_id: sku, current: { ...terms, usd_cents: 1731 },
    draft: { ...item.draft, usd_cents: 3500 } }
  const amounts = [3500, 3325, 3150, 2975]
  const list = ['', '_starter', '_pro', '_max'].map((suffix, index) => {
    const price = object('price_New' + index, amounts[index]!)
    return { ...price, lookup_key: sku + '_v2' + suffix, product: { ...price.product, id: 'shotviva_' + sku },
      metadata: { ...price.metadata, product_id: sku } }
  })
  const stripe = { prices: { list: vi.fn(async () => ({ data: list })),
    retrieve: vi.fn(async (id: string) => list.find(p => p.id === id)!) } } as unknown as Pick<Stripe,'accounts'|'prices'>
  const entries = new FormData()
  for (const p of list) entries.set(p.lookup_key, p.id)
  expect(await newBindings(stripe, pack, entries, false)).toEqual(Object.fromEntries(entries))
  list[2]!.id = 'price_Previous'
  await expect(newBindings(stripe, pack, entries, false)).rejects.toThrow('pack_m_v2_pro:price_id')
})
