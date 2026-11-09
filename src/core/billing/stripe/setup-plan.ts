import type { SiteProduct } from '../../config'
import { STRIPE_TAX_CODE, desiredPrices, stripeProductId, stripeProductName, type DesiredPrice } from './catalog'

// The diff behind scripts/stripe-setup.ts: what the Stripe account must hold for the nine
// products (6 Products, 15 Prices, ARCHITECTURE §6.2) against what it holds now. Pure, so the
// rules are unit-tested; the script only reads, prints, creates and archives. Nothing is ever
// edited in place: Prices are immutable. A Price whose only difference is the amount (a price
// change in site.config) is replaced: a new Price takes over the lookup key
// (transfer_lookup_key) and the old one is archived. Any other mismatch stops the run before
// any write, and a human decides.

export type DesiredProduct = { id: string; name: string; metadata: Record<string, string> }

export type ExistingProduct = { id: string; active: boolean; taxCode: string | null }

export type ExistingPrice = {
  id: string
  lookupKey: string
  active: boolean
  product: string
  currency: string
  unitAmount: number | null
  recurring: string | null
  taxBehavior: string | null
  metadataProductId: string | null
}

// A price change: the new Price takes the lookup key from the old one, which is then archived.
// Subscriptions already on the old Price keep renewing at the old amount (Stripe behaviour).
export type PriceReplacement = { price: DesiredPrice; oldId: string; oldAmount: number | null }

export type SetupPlan = {
  createProducts: DesiredProduct[]
  createPrices: DesiredPrice[]
  replacePrices: PriceReplacement[]
  existingProducts: number
  existingPrices: number
  mismatches: string[]
}

export function desiredProducts(products: readonly SiteProduct[], brand: string): DesiredProduct[] {
  const byId = new Map<string, DesiredProduct>()
  for (const product of products) {
    const id = stripeProductId(product)
    if (!byId.has(id)) byId.set(id, { id, name: stripeProductName(product, brand), metadata: { tier: product.tier } })
  }
  return [...byId.values()]
}

function productMismatch(found: ExistingProduct): string | null {
  if (!found.active) return `Product ${found.id} is archived`
  if (found.taxCode !== STRIPE_TAX_CODE) return `Product ${found.id} tax code is ${found.taxCode ?? 'unset'}, expected ${STRIPE_TAX_CODE}`
  return null
}

// Everything except the amount; an amount-only difference is a price change, not a mismatch.
function priceMismatch(want: DesiredPrice, found: ExistingPrice): string | null {
  const wrong: string[] = []
  if (!found.active) wrong.push('archived')
  if (found.product !== want.stripeProduct) wrong.push(`product ${found.product} ≠ ${want.stripeProduct}`)
  if (found.currency !== 'usd') wrong.push(`currency ${found.currency} ≠ usd`)
  if (found.recurring !== want.recurring) wrong.push(`recurring ${found.recurring} ≠ ${want.recurring}`)
  if (found.taxBehavior !== 'exclusive') wrong.push(`tax_behavior ${found.taxBehavior} ≠ exclusive`)
  if (found.metadataProductId !== want.productId) wrong.push(`metadata.product_id ${found.metadataProductId} ≠ ${want.productId}`)
  return wrong.length > 0 ? `Price ${want.lookupKey} (${found.id}): ${wrong.join(', ')}` : null
}

export function planSetup(input: {
  version?: 'v2'
  products: readonly SiteProduct[]
  brand: string
  existingProducts: ReadonlyMap<string, ExistingProduct>
  existingPrices: ReadonlyMap<string, ExistingPrice>
}): SetupPlan {
  const plan: SetupPlan = {
    createProducts: [],
    createPrices: [],
    replacePrices: [],
    existingProducts: 0,
    existingPrices: 0,
    mismatches: [],
  }
  for (const want of desiredProducts(input.products, input.brand)) {
    const found = input.existingProducts.get(want.id)
    if (!found) plan.createProducts.push(want)
    else {
      plan.existingProducts += 1
      const wrong = productMismatch(found)
      if (wrong) plan.mismatches.push(wrong)
    }
  }
  for (const want of desiredPrices(input.products, input.version)) {
    const found = input.existingPrices.get(want.lookupKey)
    if (!found) plan.createPrices.push(want)
    else {
      plan.existingPrices += 1
      const wrong = priceMismatch(want, found)
      if (wrong) plan.mismatches.push(wrong)
      else if (found.unitAmount !== want.unitAmount) {
        if (input.version) plan.mismatches.push(`Price ${want.lookupKey} has a different amount; published versioned prices are immutable`)
        else plan.replacePrices.push({ price: want, oldId: found.id, oldAmount: found.unitAmount })
      }
    }
  }
  return plan
}
