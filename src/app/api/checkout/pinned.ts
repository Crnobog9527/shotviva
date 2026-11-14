import type { NextRequest } from 'next/server'
import { createAdminSupabase } from '@/core/auth'
import { jsonResponse } from '@/core/api-response'
import { attemptIdentity, resumeAttempt, finishStripe, finishWaffo } from '@/core/billing/catalog-attempt'
import { DISCOUNT_CANCEL_COOKIE, stripeClient, type CheckoutBody } from '@/core/billing/stripe'
import { waffoClient } from '@/core/billing/waffo'
import { PRODUCT_IDS, type PaymentChannel, type SiteProduct } from '@/core/config'
import { catalogReadErrorCode } from '@/core/billing/product-catalog'
import { serverEnv } from '@/core/env'
import { AppError } from '@/core/errors'
import { site } from '@/site/site.config'

export async function findRetry(request: NextRequest, user: string, body: CheckoutBody, channel: PaymentChannel) {
  const nonce = request.headers.get('idempotency-key')
  const id = attemptIdentity(user, body, nonce)
  if (body.pricing_version !== 'v2' || (!nonce && serverEnv().VERCEL_ENV !== 'preview')) return { id }
  const db = createAdminSupabase()
  let saved
  try {
    saved = await resumeAttempt(db, user, channel, id)
  } catch (error) {
    if (!(await preMigrationPreview(db, error))) throw error
    return { id, legacyPreview: true }
  }
  if (!saved) {
    // A request from a phase-one tab may already have created a session under the old
    // Stripe key. Ask for fresh confirmation before starting any phase-two purchase.
    assertRevisionedRetry(nonce, body)
    return { id }
  }
  const result =
    channel === 'stripe'
      ? await finishStripe(db, stripeClient(), user, id.token, saved)
      : await finishWaffo(db, waffoClient(), user, id.token, saved)
  return { id, response: checkoutResponse(result) }
}

function assertRevisionedRetry(nonce: string | null, body: CheckoutBody) {
  if (nonce && body.expected_revision === undefined) {
    throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Refresh the page to confirm the current product revision')
  }
}

async function preMigrationPreview(db: ReturnType<typeof createAdminSupabase>, error: unknown) {
  if (catalogReadErrorCode(error) !== 'PGRST202' || serverEnv().VERCEL_ENV !== 'preview') return false
  const marker = await db.from('system_settings').select('key').eq('key', 'catalog_binding_required').maybeSingle()
  return !marker.error && !marker.data
}

export function checkoutResponse(result: { url: string; cancelReceipt?: string }) {
  const response = jsonResponse({ url: result.url })
  if (result.cancelReceipt)
    response.cookies.set(DISCOUNT_CANCEL_COOKIE, result.cancelReceipt, {
      path: '/api/checkout/cancel',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600,
    })
  return response
}

export function assertSeedPreview(products: SiteProduct[]) {
  const seed = site.billing.products
  const matchesSeed = (p: SiteProduct) => seed.some((s) => s.id === p.id && s.credits === p.credits && s.priceUsd === p.priceUsd)
  if (products.length !== PRODUCT_IDS.length || !products.every((p) => p.revision === 2 && matchesSeed(p))) {
    throw new AppError('INTERNAL', 'Catalog checkout bindings are unavailable')
  }
}
