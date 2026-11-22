import { describe, expect, it, vi } from 'vitest'

import type { ProductId } from '../../config'
import { PRODUCT_IDS } from '../../config'
import { MEMBERSHIP_PRODUCT_IDS, type MembershipProductId } from '../../waffo-env'
import type { Attempt } from '../catalog-attempt'
import { TEST_PRODUCTS } from '../stripe/test-products'
import { createWithBillingDetail } from './billing-detail'
import { createWaffoCheckout, type WaffoCheckoutDeps } from './checkout'
import { WaffoHttpError, type WaffoSessionRequest } from './client'

vi.mock('server-only', () => ({}))

// A company title Waffo refuses never stops the org owner from paying (route.ts review, #844):
// on a 4xx the session is created again without billingDetail; other failures are unchanged. A
// bound checkout never stores the title in its saved params.

const USER = '00000000-0000-4000-8000-000000000001'
const BILLING = { country: 'CN', isBusiness: true as const, businessName: 'Acme', taxId: '91310000MA1FL0000X' }
const SESSION = { sessionId: 'cs_1', checkoutUrl: 'https://checkout.waffo.ai/s/cs_1', expiresAt: '2026-11-23T00:30:00Z' }
const REQUEST = { productId: 'PROD_x', metadata: {} } as unknown as WaffoSessionRequest

const waffoWith = (...outcomes: (unknown | Error)[]) => {
  const create = vi.fn<(r: WaffoSessionRequest) => Promise<unknown>>()
  for (const o of outcomes) create.mockImplementationOnce(async () => { if (o instanceof Error) throw o; return o })
  return { createCheckoutSession: create }
}

describe('createWithBillingDetail', () => {
  it('sends billingDetail when given and stops there on success', async () => {
    const waffo = waffoWith(SESSION)
    expect(await createWithBillingDetail(waffo, REQUEST, BILLING)).toEqual(SESSION)
    expect(waffo.createCheckoutSession).toHaveBeenCalledTimes(1)
    expect(waffo.createCheckoutSession.mock.calls[0]![0].billingDetail).toEqual(BILLING)
  })

  it('a 4xx with billingDetail: one retry without it', async () => {
    const waffo = waffoWith(new WaffoHttpError('create-session', 400), SESSION)
    expect(await createWithBillingDetail(waffo, REQUEST, BILLING)).toEqual(SESSION)
    expect(waffo.createCheckoutSession).toHaveBeenCalledTimes(2)
    expect(waffo.createCheckoutSession.mock.calls[1]![0]).not.toHaveProperty('billingDetail')
  })

  it('a 5xx, a timeout, auth, conflict or rate limit is not retried (a session may exist)', async () => {
    for (const error of [new WaffoHttpError('create-session', 502), new Error('timeout'), new WaffoHttpError('create-session', 401), new WaffoHttpError('create-session', 409), new WaffoHttpError('create-session', 429)]) {
      const waffo = waffoWith(error, SESSION)
      await expect(createWithBillingDetail(waffo, REQUEST, BILLING)).rejects.toBe(error)
      expect(waffo.createCheckoutSession).toHaveBeenCalledTimes(1)
    }
  })

  it('without billingDetail a 4xx is thrown as before, no retry', async () => {
    const error = new WaffoHttpError('create-session', 400)
    const waffo = waffoWith(error, SESSION)
    await expect(createWithBillingDetail(waffo, REQUEST)).rejects.toBe(error)
    expect(waffo.createCheckoutSession).toHaveBeenCalledTimes(1)
  })
})

describe('createWaffoCheckout', () => {
  const deps = (waffo: WaffoCheckoutDeps['waffo']): WaffoCheckoutDeps => ({
    waffo,
    products: TEST_PRODUCTS,
    productIds: Object.fromEntries(PRODUCT_IDS.map((id) => [id, `PROD_${id}`])) as Record<ProductId, string>,
    subscriptionProductIds: Object.fromEntries(MEMBERSHIP_PRODUCT_IDS.map((id) => [id, `PROD_sub_${id}`])) as Record<MembershipProductId, string>,
    origin: 'https://shotviva-git-validation-preview.vercel.app',
    returnToHosts: [],
    trackStart: vi.fn(),
    newOrderRef: () => 'order-ref-1',
  })
  const body = { product_id: 'pack_l' as const, method: 'card' as const, locale: 'en' as const }

  it('unbound: a refused title falls back and the owner still gets a checkout URL', async () => {
    const waffo = waffoWith(new WaffoHttpError('create-session', 422), SESSION)
    expect(await createWaffoCheckout(deps(waffo), { userId: USER, body, billing: BILLING })).toEqual({ url: SESSION.checkoutUrl })
  })

  it('bound: saved params never carry the title; the session gets it at send time, with the same fallback', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = []
    const db = {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        if (fn === 'catalog_channel_price') return { data: null, error: null }
        if (fn === 'lock_catalog_checkout') return { data: { params: args.p_params, session_id: null, session_url: null }, error: null }
        if (fn === 'claim_waffo_catalog_session') return { data: { claimed: true }, error: null }
        if (fn === 'attach_catalog_session') return { data: true, error: null }
        throw new Error('unexpected ' + fn)
      }),
    }
    const attempt = { token: '11111111-2222-5333-8444-555555555555', hash: 'h', revision: 2, body, quote: { price: { cents: 100 } } } as unknown as Attempt
    const waffo = waffoWith(new WaffoHttpError('create-session', 400), SESSION)
    const result = await createWaffoCheckout(deps(waffo), { userId: USER, body, billing: BILLING, bound: { attempt, db, store: { storeId: 's', mode: 'test' } } })
    expect(result).toEqual({ url: SESSION.checkoutUrl })
    expect(calls.find((c) => c.fn === 'lock_catalog_checkout')!.args.p_params).not.toHaveProperty('billingDetail')
    expect(waffo.createCheckoutSession.mock.calls[0]![0].billingDetail).toEqual(BILLING)
    expect(waffo.createCheckoutSession.mock.calls[1]![0]).not.toHaveProperty('billingDetail')
  })
})
