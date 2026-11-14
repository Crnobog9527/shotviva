import 'server-only'
import type Stripe from 'stripe'
import { STRIPE_TAX_CODE, desiredPrices, type DesiredPrice } from '../../billing/stripe/catalog'
import { accountId, asProduct, checklist, priceId, type Editor } from './model'

type Reader = Pick<Stripe, 'prices' | 'accounts'>
export class ReviewError extends Error {}
function requireMatch(ok: unknown, field: string) {
  if (!ok) throw new ReviewError(field)
}

export async function verifyAccount(stripe: Reader, expected: string) {
  const actual = await stripe.accounts.retrieve(null)
  requireMatch(actual.id === accountId.parse(expected), 'stripe_account')
}

function checkAmount(p: Stripe.Price, want: DesiredPrice) {
  requireMatch(p.currency === 'usd' && p.unit_amount === want.unitAmount &&
    p.unit_amount_decimal?.toString() === String(want.unitAmount), want.lookupKey + ':amount')
  requireMatch(p.billing_scheme === 'per_unit' && !p.transform_quantity && !p.custom_unit_amount, want.lookupKey + ':billing_scheme')
}
function checkCadence(p: Stripe.Price, want: DesiredPrice) {
  const rec = p.recurring
  if (want.recurring) requireMatch(p.type === 'recurring' && rec?.interval === want.recurring && rec.interval_count === 1 && rec.usage_type === 'licensed', want.lookupKey + ':interval')
  else requireMatch(p.type === 'one_time' && !rec, want.lookupKey + ':one_time')
}
function checkProduct(p: Stripe.Price, want: DesiredPrice, tier: string, live: boolean) {
  const product = p.product
  if (typeof product === 'string' || 'deleted' in product) throw new ReviewError(want.lookupKey + ':product')
  const tax = typeof product.tax_code === 'string' ? product.tax_code : product.tax_code?.id
  requireMatch(product.id === want.stripeProduct && product.active && product.livemode === live, want.lookupKey + ':product')
  requireMatch(product.metadata.tier === tier && tax === STRIPE_TAX_CODE, want.lookupKey + ':product_tax_tier')
}
// Listing by key and retrieving the exact immutable ID catches a partial transfer.
export function checkPrice(p: Stripe.Price, want: DesiredPrice, tier: string, live: boolean, publication?: string) {
  const key = want.lookupKey
  requireMatch(p.lookup_key === key && p.active && p.livemode === live, key + ':key_active_mode')
  requireMatch(p.tax_behavior === 'exclusive' && p.metadata.product_id === want.productId, key + ':tax_metadata')
  if (publication) requireMatch(p.metadata.catalog_publication_id === publication, key + ':publication_id')
  checkAmount(p,want)
  checkCadence(p,want)
  checkProduct(p,want,tier,live)
}

async function readIds(stripe: Reader, keys: string[]) {
  if (!keys.length) return new Map<string,string>()
  const { data } = await stripe.prices.list({ lookup_keys: keys, limit: 100, active: true })
  return new Map(data.map(p => [p.lookup_key, p.id]))
}

export async function oldBindings(stripe: Reader, item: Editor, live: boolean) {
  if (!item.current) return {}
  const forms = desiredPrices([asProduct(item, item.current)], 'v2')
  const found = await readIds(stripe, forms.map(f => f.lookupKey))
  return Object.fromEntries(await Promise.all(forms.map(async f => {
    const id = found.get(f.lookupKey)
    requireMatch(id && (!item.bindings[f.lookupKey] || item.bindings[f.lookupKey] === id), f.lookupKey + ':old_id')
    const p = await stripe.prices.retrieve(priceId.parse(id), { expand: ['product'] })
    requireMatch(p.id === id, f.lookupKey + ':price_id')
    checkPrice(p, f, item.tier, live)
    return [f.lookupKey, p.id]
  })))
}

export async function newBindings(stripe: Reader, item: Editor, entered: FormData, live: boolean) {
  const forms = checklist(item)
  const found = await readIds(stripe, forms.map(f => f.lookupKey))
  return Object.fromEntries(await Promise.all(forms.map(async f => {
    const id = f.reuse ? f.oldId : priceId.parse(entered.get(f.lookupKey))
    requireMatch(id && id === found.get(f.lookupKey), f.lookupKey + ':price_id')
    const p = await stripe.prices.retrieve(priceId.parse(id), { expand: ['product'] })
    requireMatch(p.id === id, f.lookupKey + ':price_id')
    checkPrice(p, f, item.tier, live, f.reuse ? undefined : item.request!.id)
    return [f.lookupKey, p.id]
  })))
}
