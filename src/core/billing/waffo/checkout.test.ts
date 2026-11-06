import { verify } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type { ProductId } from '../../config'
import { PRODUCT_IDS } from '../../config'
import { TEST_PRODUCTS } from '../stripe/test-products'
import { WAFFO_SESSION_TTL_SECONDS, createWaffoCheckout, type WaffoCheckoutDeps } from './checkout'
import { signWaffoRequest, type WaffoSessionRequest } from './client'
import { normalizePem } from './config'
import { waffoKeys } from '../../../../tests/fakes/waffo'
import { MEMBERSHIP_PRODUCT_IDS, type MembershipProductId } from '../../waffo-env'

const USER = '00000000-0000-4000-8000-000000000001'
const PRODUCT_IDS_MAP = Object.fromEntries(PRODUCT_IDS.map((id) => [id, `PROD_${id.replace('_', '')}`])) as Record<ProductId, string>
const SUBSCRIPTION_IDS = Object.fromEntries(MEMBERSHIP_PRODUCT_IDS.map((id) => [id, `PROD_sub${id.replace('_', '')}`])) as Record<MembershipProductId, string>
const SESSION = {
  sessionId: 'cs_550e8400-e29b-41d4-a716-446655440000',
  checkoutUrl: 'https://checkout.waffo.ai/shotviva/checkout/cs_550e8400-e29b-41d4-a716-446655440000',
  expiresAt: '2026-11-06T12:00:00.000Z',
}

function harness(session: unknown = SESSION) {
  const create = vi.fn<(request: WaffoSessionRequest) => Promise<unknown>>(async () => session)
  const trackStart = vi.fn()
  const deps: WaffoCheckoutDeps = {
    waffo: { createCheckoutSession: create },
    products: TEST_PRODUCTS,
    productIds: PRODUCT_IDS_MAP,
    subscriptionProductIds: SUBSCRIPTION_IDS,
    origin: 'https://shotviva-git-validation-preview.vercel.app',
    returnToHosts: ['graylum.ai'],
    trackStart,
    newOrderRef: () => 'order-ref-1',
  }
  return { deps, create, trackStart }
}

const body = (productId: ProductId, method: 'card' | 'alipay' = 'card') => ({ product_id: productId, method, locale: 'en' as const })

describe('createWaffoCheckout', () => {
  it('a membership by card is the Waffo subscription product, cards only, priced from site.config (T50)', async () => {
    const { deps, create, trackStart } = harness()
    const result = await createWaffoCheckout(deps, { userId: USER, body: body('starter_monthly') })

    expect(result).toEqual({ url: SESSION.checkoutUrl })
    expect(create).toHaveBeenCalledWith({
      productId: 'PROD_substartermonthly',
      currency: 'USD',
      priceSnapshot: { amount: '19.90', taxIncluded: false, taxCategory: 'saas' },
      successUrl: 'https://shotviva-git-validation-preview.vercel.app/checkout?channel=waffo&p=starter_monthly',
      expiresInSeconds: WAFFO_SESSION_TTL_SECONDS,
      metadata: { user_id: USER, product_id: 'starter_monthly', method: 'card', locale: 'en' },
      orderMerchantExternalId: 'order-ref-1',
      language: 'en',
      includePaymentMethods: ['card'],
    })
    expect(trackStart).toHaveBeenCalledWith(USER, {
      product_id: 'starter_monthly',
      tier: 'starter',
      interval: 'month',
      form: 'subscription',
      channel: 'waffo',
      method: 'card',
    }, 'en')
  })

  it('Alipay and packs stay one-time products: no trial, no payment-method list', async () => {
    const { deps, create, trackStart } = harness()
    await createWaffoCheckout(deps, { userId: USER, body: { ...body('max_yearly', 'alipay'), locale: 'zh' } })
    await createWaffoCheckout(deps, { userId: USER, body: body('pack_l') })
    const [alipay, pack] = create.mock.calls.map((call) => call[0] as unknown as Record<string, unknown>)
    for (const request of [alipay, pack]) {
      expect(request).not.toHaveProperty('withTrial')
      expect(request).not.toHaveProperty('includePaymentMethods')
    }
    expect(alipay).toMatchObject({ productId: 'PROD_maxyearly', priceSnapshot: { amount: '713.00' }, language: 'zh-Hans' })
    expect(pack).toMatchObject({ productId: 'PROD_packl' })
    expect(trackStart.mock.calls.map((call) => (call[1] as { form: string }).form)).toEqual(['one_time', 'one_time'])
  })

  it('keeps an allowlisted Graylum return in the success URL, drops anything else', async () => {
    const { deps, create } = harness()
    await createWaffoCheckout(deps, { userId: USER, body: { ...body('pack_s'), return_to: 'https://graylum.ai/app' } })
    await createWaffoCheckout(deps, { userId: USER, body: { ...body('pack_s'), return_to: 'https://evil.example/app' } })
    expect(create.mock.calls[0]?.[0].successUrl).toContain('from=graylum&return_to=https%3A%2F%2Fgraylum.ai%2Fapp')
    expect(create.mock.calls[1]?.[0].successUrl).toBe('https://shotviva-git-validation-preview.vercel.app/checkout?channel=waffo&p=pack_s')
  })

  it('refuses a session URL that is not on a Waffo host', async () => {
    const { deps, trackStart } = harness({ ...SESSION, checkoutUrl: 'https://checkout.evil.example/cs_1' })
    await expect(createWaffoCheckout(deps, { userId: USER, body: body('pack_s') })).rejects.toMatchObject({ code: 'INTERNAL' })
    expect(trackStart).not.toHaveBeenCalled()
  })

  it('refuses an unknown or unpriced product before calling Waffo', async () => {
    const { deps, create } = harness()
    deps.products = TEST_PRODUCTS.map((p) => (p.id === 'pack_m' ? { ...p, priceUsd: 0 } : p))
    await expect(createWaffoCheckout(deps, { userId: USER, body: body('pack_m') })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(create).not.toHaveBeenCalled()
  })
})

describe('signWaffoRequest', () => {
  it('signs METHOD\\nPATH\\nTIMESTAMP\\nbase64(sha256(body)) so Waffo’s public key verifies it', async () => {
    const { publicKey, privateKey } = waffoKeys()
    const input = { path: '/v1/actions/checkout/create-session', timestamp: '1705312200', body: '{"a":1}' }
    const signature = signWaffoRequest({ ...input, privateKey })
    // sha256 of '{"a":1}', base64.
    const digest = (await import('node:crypto')).createHash('sha256').update(input.body).digest('base64')
    const canonical = `POST\n${input.path}\n${input.timestamp}\n${digest}`
    expect(verify('sha256', Buffer.from(canonical), publicKey, Buffer.from(signature, 'base64'))).toBe(true)
  })
})

describe('normalizePem', () => {
  it('rewraps a one-line dashboard paste and keeps the PKCS#1 label', () => {
    const { privateKey } = waffoKeys()
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    const oneLine = pem.trim().replaceAll('\n', '\\n')
    expect(normalizePem(oneLine, 'PRIVATE')).toBe(pem)
    const bare = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
    expect(normalizePem(bare, 'PRIVATE')).toMatch(/^-----BEGIN PRIVATE KEY-----\n/)
  })
})
