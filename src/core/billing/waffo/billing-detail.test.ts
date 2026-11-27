import { describe, expect, it, vi } from 'vitest'

import type { ProductId } from '../../config'
import { PRODUCT_IDS } from '../../config'
import { MEMBERSHIP_PRODUCT_IDS, type MembershipProductId } from '../../waffo-env'
import { TEST_PRODUCTS } from '../stripe/test-products'
import { buyerBillingDetail, waffoBillingDetail } from './billing-detail'
import { createWaffoCheckout, type WaffoCheckoutDeps } from './checkout'
import type { WaffoSessionRequest } from './client'

vi.mock('server-only', () => ({}))

// 开票信息 on Waffo invoices (ARCHITECTURE §6.5): the current owner of an org with a saved profile
// gets billingDetail { isBusiness: true, businessName, taxId, ... }; everyone else none.

const USER = '00000000-0000-4000-8000-000000000001'
const PROFILE = {
  legalName: '上海示例科技有限公司',
  taxId: '91310000MA1FL0000X',
  country: 'CN',
  postcode: '200000',
  state: null,
  invoiceEmail: 'finance@example.com',
  updatedAt: '2026-11-23T00:00:00Z',
}
const ROW = { legal_name: PROFILE.legalName, tax_id: PROFILE.taxId, country: 'CN', postcode: '200000', state: null, invoice_email: PROFILE.invoiceEmail, updated_at: PROFILE.updatedAt }

const rpc = (data: unknown, error: { message: string } | null = null) => ({ rpc: vi.fn(async () => ({ data, error })) })

describe('waffoBillingDetail', () => {
  it('maps a saved profile to a business billingDetail, optional fields only when set', () => {
    expect(waffoBillingDetail(PROFILE)).toEqual({ country: 'CN', isBusiness: true, businessName: PROFILE.legalName, taxId: PROFILE.taxId, postcode: '200000' })
    expect(waffoBillingDetail({ ...PROFILE, country: 'US', postcode: null, state: 'CA' })).toEqual({ country: 'US', isBusiness: true, businessName: PROFILE.legalName, taxId: PROFILE.taxId, state: 'CA' })
  })

  it('never carries the invoice email (Waffo uses the checkout email)', () => {
    expect(JSON.stringify(waffoBillingDetail(PROFILE))).not.toMatch(/email|finance@/i)
  })

  it('no profile: nothing', () => {
    expect(waffoBillingDetail(null)).toBeUndefined()
  })
})

describe('buyerBillingDetail', () => {
  it('owner with a profile: billingDetail from the checkout read', async () => {
    const db = rpc(ROW)
    expect(await buyerBillingDetail(db as never, USER)).toMatchObject({ isBusiness: true, businessName: PROFILE.legalName, taxId: PROFILE.taxId })
    expect(db.rpc).toHaveBeenCalledWith('org_checkout_billing_profile', { p_user: USER })
  })

  it('non-owner or owner without a profile (the function returns null): absent', async () => {
    expect(await buyerBillingDetail(rpc(null) as never, USER)).toBeUndefined()
  })

  it('a failed read never blocks the purchase: absent', async () => {
    expect(await buyerBillingDetail(rpc(null, { message: 'boom' }) as never, USER)).toBeUndefined()
  })
})

describe('createWaffoCheckout with billing', () => {
  function harness() {
    const create = vi.fn<(request: WaffoSessionRequest) => Promise<unknown>>(async () => ({
      sessionId: 'cs_1', checkoutUrl: 'https://checkout.waffo.ai/s/cs_1', expiresAt: '2026-11-23T00:30:00Z',
    }))
    const deps: WaffoCheckoutDeps = {
      waffo: { createCheckoutSession: create },
      products: TEST_PRODUCTS,
      productIds: Object.fromEntries(PRODUCT_IDS.map((id) => [id, `PROD_${id}`])) as Record<ProductId, string>,
      subscriptionProductIds: Object.fromEntries(MEMBERSHIP_PRODUCT_IDS.map((id) => [id, `PROD_sub_${id}`])) as Record<MembershipProductId, string>,
      origin: 'https://shotviva-git-validation-preview.vercel.app',
      returnToHosts: [],
      trackStart: vi.fn(),
      newOrderRef: () => 'order-ref-1',
    }
    return { deps, create }
  }

  it('sends billingDetail on one-time and subscription sessions when given', async () => {
    const { deps, create } = harness()
    const billing = waffoBillingDetail(PROFILE)
    await createWaffoCheckout(deps, { userId: USER, body: { product_id: 'pack_l', method: 'alipay', locale: 'zh' }, billing })
    await createWaffoCheckout(deps, { userId: USER, body: { product_id: 'pro_monthly', method: 'card', locale: 'en' }, billing })
    for (const [request] of create.mock.calls) expect(request.billingDetail).toEqual(billing)
  })

  it('leaves billingDetail out entirely otherwise', async () => {
    const { deps, create } = harness()
    await createWaffoCheckout(deps, { userId: USER, body: { product_id: 'pack_l', method: 'card', locale: 'en' } })
    expect(create.mock.calls[0]![0]).not.toHaveProperty('billingDetail')
  })
})
