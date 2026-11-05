import type { SiteProduct } from '../../config'
import { STRIPE_TAX_CODE, desiredPrices, stripeProductId, stripeProductName, type DesiredPrice } from './catalog'

// The diff behind scripts/stripe-setup.ts: what the Stripe account must hold for the nine
// products (6 Products, 15 Prices, ARCHITECTURE §6.2) against what it holds now. Pure, so the
// rules are unit-tested; the script only reads, prints and creates. Nothing is ever updated:
// a mismatch stops the run before any write, and a human decides (Prices are immutable anyway).

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

export type SetupPlan = {
  createProducts: DesiredProduct[]
  createPrices: DesiredPrice[]
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

function priceMismatch(want: DesiredPrice, found: ExistingPrice): string | null {
  const wrong: string[] = []
  if (!found.active) wrong.push('archived')
  if (found.product !== want.stripeProduct) wrong.push(`product ${found.product} ≠ ${want.stripeProduct}`)
  if (found.currency !== 'usd' || found.unitAmount !== want.unitAmount) {
    wrong.push(`amount ${found.unitAmount} ${found.currency} ≠ ${want.unitAmount} usd`)
  }
  if (found.recurring !== want.recurring) wrong.push(`recurring ${found.recurring} ≠ ${want.recurring}`)
  if (found.taxBehavior !== 'exclusive') wrong.push(`tax_behavior ${found.taxBehavior} ≠ exclusive`)
  if (found.metadataProductId !== want.productId) wrong.push(`metadata.product_id ${found.metadataProductId} ≠ ${want.productId}`)
  return wrong.length > 0 ? `Price ${want.lookupKey} (${found.id}): ${wrong.join(', ')}` : null
}

export function planSetup(input: {
  products: readonly SiteProduct[]
  brand: string
  existingProducts: ReadonlyMap<string, ExistingProduct>
  existingPrices: ReadonlyMap<string, ExistingPrice>
}): SetupPlan {
  const plan: SetupPlan = { createProducts: [], createPrices: [], existingProducts: 0, existingPrices: 0, mismatches: [] }
  for (const want of desiredProducts(input.products, input.brand)) {
    const found = input.existingProducts.get(want.id)
    if (!found) plan.createProducts.push(want)
    else {
      plan.existingProducts += 1
      const wrong = productMismatch(found)
      if (wrong) plan.mismatches.push(wrong)
    }
  }
  for (const want of desiredPrices(input.products)) {
    const found = input.existingPrices.get(want.lookupKey)
    if (!found) plan.createPrices.push(want)
    else {
      plan.existingPrices += 1
      const wrong = priceMismatch(want, found)
      if (wrong) plan.mismatches.push(wrong)
    }
  }
  return plan
}
