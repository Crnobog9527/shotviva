import type { NextRequest } from 'next/server'

import { bindReferral } from '@/core/affiliate/referral'
import { notifyOwner } from '@/core/alerts'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, clientIp, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import {
  assertOffered,
  checkoutBodySchema,
  checkoutToken,
  createCheckout,
  managedPaymentsEnabled,
  wechatPayEnabled,
  stripeClient,
  termsConsentEnabled,
  type CheckoutBody,
  type CheckoutClient,
} from '@/core/billing/stripe'
import { catalogReadErrorCode, listedProducts, readProductCatalog } from '@/core/billing/product-catalog'
import type { SiteProduct } from '@/core/config'
import { readActivePricing } from '@/core/billing/active-pricing'
import { assertPricingVersions, buyerQuote, type BuyerQuote } from '@/core/billing/buyer-quote'
import { configuredPricing } from '@/core/billing/checkout-price'
import { assertCanBuy } from '@/core/billing/subscription'
import { createWaffoCheckout, paymentChannel, waffoClient, waffoConfig } from '@/core/billing/waffo'
import { AppError } from '@/core/errors'
import { appOrigin } from '@/core/site-url'
import { site } from '@/site/site.config'
import { assertRevision, type Attempt } from '@/core/billing/catalog-attempt'
import { assertSeedPreview, checkoutResponse, findRetry } from './pinned'
import { qaCustomerFor } from './qa-clock'

// One authenticated purchase path for both channels. A new order always reads the database.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiBuyer()
    const body = await parseBody(request)
    // Only what the buyer's page listed: 中国银行卡 needs a zh locale and the Stripe channel (T64).
    const channel = paymentChannel()
    assertOffered(body, channel)
    // Upgrades only: the same or a lower plan while a membership runs answers 409. An upgrade is
    // an ordinary checkout at full price; the payment webhook cancels the old subscription.
    const admin = createAdminSupabase()
    const version = configuredPricing(site.billing)
    const {id,response: retry,legacyPreview} = await findRetry(request,user.id,body,channel)
    if (retry) return retry
    const { products, product, revision } = await offeredProduct(admin, version, body)
    if (legacyPreview) assertSeedPreview(products)
    await assertCanBuy(admin, user.id, product)
    assertPricingVersions(version, await readActivePricing(admin), body.pricing_version)
    const quote = version && await buyerQuote(admin, user.id, product, body, channel)
    await bindReferral(user.id, request.cookies.get('sv_ref')?.value, 'first_checkout')
    const attempt = quote && !legacyPreview ? {...id,revision,body:body,quote} : undefined
    if (channel === 'waffo') return jsonResponse(await startWaffo(products, user.id, body, quote, attempt))
    return await stripeResponse(request, products, user, body, quote, attempt)
  } catch (error) {
    return errorResponse(error, 'checkout')
  }
}

async function parseBody(request: NextRequest) {
  const result = checkoutBodySchema.safeParse(await request.json().catch(() => null))
  if (!result.success) throw new AppError('INVALID_INPUT', 'product_id and method are required')
  return result.data
}

type Buyer = { id: string; email: string | null }

async function stripeResponse(request: NextRequest, products: SiteProduct[], user: Buyer, body: CheckoutBody, quote?: BuyerQuote, attempt?: Attempt) {
  const client = { ip: clientIp(request.headers), userAgent: request.headers.get('user-agent') }
  const token = attempt?.token ?? checkoutToken(user.id, body, request.headers.get('idempotency-key'), products, quote)
  return checkoutResponse(await startStripe(products, user, body, client, token, quote, attempt))
}

async function offeredProduct(admin: ReturnType<typeof createAdminSupabase>, version: ReturnType<typeof configuredPricing>, body: CheckoutBody) {
  const rows = await readProductCatalog(admin, version).catch((error: unknown) => {
    notifyOwner({ kind: 'checkout_catalog_failed', code: catalogReadErrorCode(error) })
    throw error
  })
  const products = listedProducts(rows)
  const product = products.find(p => p.id === body.product_id)
  if (!product || !product.revision) throw new AppError('NOT_FOUND', 'Unknown product')
  if (version) assertRevision(product, product.revision, body)
  return { products, product, revision: product.revision }
}

const shared = { origin: appOrigin, returnToHosts: site.partners.graylum.returnToHosts }

function startStripe(products: SiteProduct[], user: Buyer, body: CheckoutBody, client: CheckoutClient, token: string, quote?: BuyerQuote, attempt?: Attempt) {
  const deps = { ...shared, products, stripe: stripeClient(), codes: createAdminSupabase(), managedPayments: managedPaymentsEnabled(), wechatPay: wechatPayEnabled(), termsConsent: termsConsentEnabled(), qaCustomer: qaCustomerFor(user) }
  return createCheckout(deps, { attempt, userId: user.id, body, client, token, quote: quote?.price, selectedCode: quote?.selectedCode })
}

function startWaffo(products: SiteProduct[], userId: string, body: CheckoutBody, quote?: BuyerQuote, attempt?: Attempt) {
  if (body.expected_code) throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Discount is unavailable on this payment channel')
  const config = waffoConfig()
  const deps = { ...shared, products, waffo: waffoClient(), productIds: config.productIds, subscriptionProductIds: config.subscriptionProductIds }
  return createWaffoCheckout(deps, { bound:attempt ? {attempt,db:createAdminSupabase(),store:config} : undefined, userId, body, quote: quote?.price })
}
