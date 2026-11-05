/**
 * Creates the Stripe catalog for the nine products (ARCHITECTURE §6.2): 6 Products with tax code
 * txcd_10105001 and 15 Prices with lookup_key and metadata.product_id. Idempotent:
 *
 *   STRIPE_SECRET_KEY=sk_test_… pnpm tsx scripts/stripe-setup.ts          # sandbox
 *   STRIPE_SECRET_KEY=sk_live_… pnpm tsx scripts/stripe-setup.ts --live   # at launch
 *
 * What exists and matches is skipped; what is missing is created. If anything that exists
 * disagrees with site.config (amount, interval, product, tax code, metadata), the run stops
 * before writing anything and lists every mismatch: nothing is ever overwritten.
 * The key is read from the environment only and never printed.
 */
import Stripe from 'stripe'
import { z } from 'zod'

import type { DesiredPrice } from '../src/core/billing/stripe/catalog'
import { STRIPE_TAX_CODE } from '../src/core/billing/stripe/catalog'
import {
  planSetup,
  type DesiredProduct,
  type ExistingPrice,
  type ExistingProduct,
} from '../src/core/billing/stripe/setup-plan'
import { site } from '../src/site/site.config'

const env = z
  .object({ STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, 'must be a Stripe secret key') })
  .safeParse(process.env)
if (!env.success) {
  console.error('Set STRIPE_SECRET_KEY to the Stripe secret key of the account to set up.')
  process.exit(1)
}
const key = env.data.STRIPE_SECRET_KEY
const live = /^(sk|rk)_live_/.test(key)
if (live && !process.argv.includes('--live')) {
  console.error('This is a live key. Re-run with --live to set up the live account.')
  process.exit(1)
}

const stripe = new Stripe(key, { maxNetworkRetries: 2 })
const products = site.billing.products

function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))
}

async function readProduct(id: string): Promise<ExistingProduct | null> {
  try {
    const found = await stripe.products.retrieve(id)
    const code = found.tax_code
    return { id: found.id, active: found.active, taxCode: typeof code === 'string' ? code : (code?.id ?? null) }
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return null
    throw error
  }
}

function toExisting(price: Stripe.Price): ExistingPrice {
  return {
    id: price.id,
    lookupKey: price.lookup_key ?? '',
    active: price.active,
    product: typeof price.product === 'string' ? price.product : price.product.id,
    currency: price.currency,
    unitAmount: price.unit_amount,
    recurring: price.recurring?.interval ?? null,
    taxBehavior: price.tax_behavior,
    metadataProductId: price.metadata?.product_id ?? null,
  }
}

async function readPrices(lookupKeys: string[]): Promise<Map<string, ExistingPrice>> {
  const found = new Map<string, ExistingPrice>()
  // Stripe takes at most 10 lookup keys per list call; archived Prices are listed too.
  for (const batch of chunks(lookupKeys, 10)) {
    const { data } = await stripe.prices.list({ lookup_keys: batch, limit: 100 })
    for (const price of data) found.set(price.lookup_key ?? '', toExisting(price))
  }
  return found
}

async function createProduct(product: DesiredProduct): Promise<void> {
  await stripe.products.create({ id: product.id, name: product.name, tax_code: STRIPE_TAX_CODE, metadata: product.metadata })
  console.log(`created Product ${product.id}`)
}

async function createPrice(price: DesiredPrice): Promise<void> {
  await stripe.prices.create({
    product: price.stripeProduct,
    currency: 'usd',
    unit_amount: price.unitAmount,
    // Managed Payments adds tax on top at checkout (§6.3).
    tax_behavior: 'exclusive',
    lookup_key: price.lookupKey,
    metadata: { product_id: price.productId },
    ...(price.recurring ? { recurring: { interval: price.recurring } } : {}),
  })
  console.log(`created Price ${price.lookupKey}`)
}

async function main(): Promise<void> {
  console.log(`Stripe ${live ? 'LIVE' : 'test'} account`)
  const plan0 = planSetup({ products, brand: site.brand.name, existingProducts: new Map(), existingPrices: new Map() })
  const productIds = plan0.createProducts.map((p) => p.id)
  const existingProducts = new Map<string, ExistingProduct>()
  for (const id of productIds) {
    const found = await readProduct(id)
    if (found) existingProducts.set(id, found)
  }
  const existingPrices = await readPrices(plan0.createPrices.map((p) => p.lookupKey))
  const plan = planSetup({ products, brand: site.brand.name, existingProducts, existingPrices })

  if (plan.mismatches.length > 0) {
    console.error(`Stopped: ${plan.mismatches.length} mismatch(es); nothing was created or changed.`)
    for (const line of plan.mismatches) console.error(`  - ${line}`)
    process.exit(1)
  }
  for (const product of plan.createProducts) await createProduct(product)
  for (const price of plan.createPrices) await createPrice(price)
  console.log(
    `Done: ${plan.createProducts.length} Products and ${plan.createPrices.length} Prices created, ` +
      `${plan.existingProducts} Products and ${plan.existingPrices} Prices already in place.`,
  )
}

main().catch((error: unknown) => {
  // Stripe errors carry no key; print the message only.
  console.error(error instanceof Error ? error.message : 'stripe-setup failed')
  process.exit(1)
})
