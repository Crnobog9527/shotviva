/**
 * Compares Stripe with the published database catalog (ARCHITECTURE §6.2). In v2 the
 * product editor owns publication and this script only reports catalog differences. Baseline: 6 Products
 * with tax code txcd_10105001 and 15 Prices with lookup_key and metadata.product_id. Also keeps
 * the card-only payment method configuration 中国银行卡 checks out with (T64): card on, Link,
 * Apple Pay and Google Pay off; created when missing, its preferences reset when they drift.
 * Idempotent. Also reads (never changes) the account's webhook endpoints and names any event the
 * Shotviva endpoint is not subscribed to yet (src/core/billing/stripe/webhook-events.ts; T71 added
 * charge.dispute.closed): the Owner ticks those in the Dashboard (Developers → Webhooks).
 * Without --apply it only prints the plan (dry run); with --apply it writes:
 *
 *   pnpm tsx --env-file=.env.local scripts/stripe-setup.ts                  # dry run
 *   pnpm tsx --env-file=.env.local scripts/stripe-setup.ts --apply          # sandbox
 *   pnpm tsx --env-file=.env.local scripts/stripe-setup.ts --apply --live   # live account
 *
 * What exists and matches is skipped; what is missing is created. A Price whose only difference
 * is the amount (a price change) is replaced: a new Price takes over its lookup key
 * (transfer_lookup_key) and the old Price is archived; subscriptions already on the old Price
 * keep it. Any other disagreement (interval, product, tax code, metadata, archived) stops the
 * run before anything is written and lists every mismatch. The key is never printed.
 */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { catalog, listedProducts } from '../src/core/billing/catalog-rows'
import { z } from 'zod'

import { configuredPricing } from '../src/core/billing/checkout-price'
import type { DesiredPrice } from '../src/core/billing/stripe/catalog'
import {
  CARD_ONLY_CONFIG_NAME,
  CARD_ONLY_PREFERENCES,
  STRIPE_TAX_CODE,
  cardOnlyDrift,
  type CardOnlyMethod,
} from '../src/core/billing/stripe/catalog'
import {
  planSetup,
  type DesiredProduct,
  type ExistingPrice,
  type ExistingProduct,
  type PriceReplacement,
  type SetupPlan,
} from '../src/core/billing/stripe/setup-plan'
import { missingWebhookEvents } from '../src/core/billing/stripe/webhook-events'
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

const apply = process.argv.includes('--apply')
const stripe = new Stripe(key, { maxNetworkRetries: 2 })
async function databaseCatalog() {
  const config = z.object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) }).parse(process.env)
  const db = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: marker, error: markerError } = await db.from('system_settings').select('value').eq('key','pricing_catalog_version').maybeSingle()
  if (markerError || (marker?.value ?? 'v1') !== (site.billing.pricingVersion ?? 'v1')) throw new Error('Database and configured pricing versions differ')
  const { data, error } = await db.rpc('read_product_catalog', { p_version: marker?.value ?? 'v1' })
  if (error) throw new Error('Cannot read the published product catalog')
  return listedProducts(catalog.parse(data))
}

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

async function createPrice(price: DesiredPrice, transferLookupKey = false): Promise<string> {
  const created = await stripe.prices.create({
    product: price.stripeProduct,
    currency: 'usd',
    unit_amount: price.unitAmount,
    // Managed Payments adds tax on top at checkout (§6.3).
    tax_behavior: 'exclusive',
    lookup_key: price.lookupKey,
    metadata: { product_id: price.productId },
    ...(price.recurring ? { recurring: { interval: price.recurring } } : {}),
    ...(transferLookupKey ? { transfer_lookup_key: true } : {}),
  })
  console.log(`created Price ${price.lookupKey} (${created.id})`)
  return created.id
}

// New Price first (it takes the lookup key in the same call), then the old one is archived, so
// checkout never finds the key empty. A rerun after a crash between the two finds the key
// already on the right amount and does nothing.
async function replacePrice(change: PriceReplacement): Promise<void> {
  await createPrice(change.price, true)
  await stripe.prices.update(change.oldId, { active: false })
  console.log(`archived Price ${change.oldId} (was ${change.oldAmount} cents)`)
}

function printPlan(plan: SetupPlan): void {
  for (const product of plan.createProducts) console.log(`  + Product ${product.id}`)
  for (const price of plan.createPrices) console.log(`  + Price ${price.lookupKey}: ${price.unitAmount} cents`)
  for (const change of plan.replacePrices) {
    console.log(`  ~ Price ${change.price.lookupKey}: ${change.oldAmount} → ${change.price.unitAmount} cents (new Price, ${change.oldId} archived)`)
  }
  const writes = plan.createProducts.length + plan.createPrices.length + plan.replacePrices.length
  console.log(writes === 0 ? 'Nothing to do: everything is in place.' : `${writes} change(s) planned.`)
}

type CardOnlyPlan = { action: 'create' } | { action: 'update'; id: string; drift: CardOnlyMethod[] } | { action: 'none'; id: string }

async function planCardOnly(): Promise<CardOnlyPlan> {
  const { data } = await stripe.paymentMethodConfigurations.list({ limit: 100 })
  const found = data.find((c) => c.active && c.name === CARD_ONLY_CONFIG_NAME)
  if (!found) return { action: 'create' }
  const preference = (m: CardOnlyMethod) => found[m]?.display_preference?.preference ?? null
  const drift = cardOnlyDrift({ card: preference('card'), apple_pay: preference('apple_pay'), google_pay: preference('google_pay'), link: preference('link') })
  return drift.length > 0 ? { action: 'update', id: found.id, drift } : { action: 'none', id: found.id }
}

const preferences = Object.fromEntries(
  Object.entries(CARD_ONLY_PREFERENCES).map(([method, preference]) => [method, { display_preference: { preference } }]),
)

async function applyCardOnly(plan: CardOnlyPlan): Promise<void> {
  if (plan.action === 'create') {
    const created = await stripe.paymentMethodConfigurations.create({ name: CARD_ONLY_CONFIG_NAME, ...preferences })
    console.log(`created payment method configuration ${CARD_ONLY_CONFIG_NAME} (${created.id})`)
  } else if (plan.action === 'update') {
    await stripe.paymentMethodConfigurations.update(plan.id, preferences)
    console.log(`reset ${plan.drift.join(', ')} on ${CARD_ONLY_CONFIG_NAME} (${plan.id})`)
  }
}

function printCardOnly(plan: CardOnlyPlan): void {
  if (plan.action === 'create') console.log(`  + Payment method configuration ${CARD_ONLY_CONFIG_NAME}`)
  else if (plan.action === 'update') console.log(`  ~ ${CARD_ONLY_CONFIG_NAME}: reset ${plan.drift.join(', ')}`)
  else console.log(`  = ${CARD_ONLY_CONFIG_NAME} in place (${plan.id})`)
}

// Read only: webhook endpoints are set up by hand in the Dashboard (one per mode, ARCHITECTURE §6.3).
async function checkWebhookEvents(): Promise<void> {
  const endpoints = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter((e) => e.url.includes('/api/webhooks/stripe'))
  if (endpoints.length === 0) console.log('  ! No webhook endpoint for /api/webhooks/stripe on this account.')
  for (const endpoint of endpoints) {
    const missing = missingWebhookEvents(endpoint.enabled_events)
    if (missing.length === 0) console.log(`  = Webhook ${endpoint.url}: all events subscribed`)
    else console.log(`  ! Webhook ${endpoint.url}: subscribe it to ${missing.join(', ')} (Dashboard → Developers → Webhooks)`)
  }
}

async function main(): Promise<void> {
  console.log(`Stripe ${live ? 'LIVE' : 'test'} account${apply ? '' : ' (dry run)'}`)
  const products = await databaseCatalog()
  const plan0 = planSetup({ products, version: configuredPricing(site.billing), brand: site.brand.name, existingProducts: new Map(), existingPrices: new Map() })
  const productIds = plan0.createProducts.map((p) => p.id)
  const existingProducts = new Map<string, ExistingProduct>()
  for (const id of productIds) {
    const found = await readProduct(id)
    if (found) existingProducts.set(id, found)
  }
  const existingPrices = await readPrices(plan0.createPrices.map((p) => p.lookupKey))
  const plan = planSetup({ products, version: configuredPricing(site.billing), brand: site.brand.name, existingProducts, existingPrices })

  if (plan.mismatches.length > 0) {
    console.error(`Stopped: ${plan.mismatches.length} mismatch(es); nothing was created or changed.`)
    for (const line of plan.mismatches) console.error(`  - ${line}`)
    process.exit(1)
  }
  printPlan(plan)
  if (apply && site.billing.pricingVersion && (plan.createProducts.length || plan.createPrices.length || plan.replacePrices.length)) {
    throw new Error('Manage v2 Products, Prices and lookup keys through the product editor manual checklist.')
  }
  if (process.argv.includes('--versioned-prices-only')) {
    if (configuredPricing(site.billing) !== 'v2' || plan.createProducts.length || plan.replacePrices.length) {
      throw new Error('Versioned prices require the approved v2 catalog and six existing Shotviva Products.')
    }
    if (apply) {
      for (const price of plan.createPrices) await createPrice(price)
    } else console.log('Dry run: no versioned prices were created.')
    return
  }
  await checkWebhookEvents()
  const cardOnly = await planCardOnly()
  printCardOnly(cardOnly)
  if (!apply) {
    console.log('Dry run: nothing was written. Re-run with --apply to make these changes.')
    return
  }
  for (const product of plan.createProducts) await createProduct(product)
  for (const price of plan.createPrices) await createPrice(price)
  for (const change of plan.replacePrices) await replacePrice(change)
  await applyCardOnly(cardOnly)
  console.log(
    `Done: ${plan.createProducts.length} Products and ${plan.createPrices.length} Prices created, ` +
      `${plan.replacePrices.length} Prices replaced, ` +
      `${plan.existingProducts} Products and ${plan.existingPrices} Prices already in place.`,
  )
}

main().catch((error: unknown) => {
  // Stripe errors carry no key; print the message only.
  console.error(error instanceof Error ? error.message : 'stripe-setup failed')
  process.exit(1)
})
