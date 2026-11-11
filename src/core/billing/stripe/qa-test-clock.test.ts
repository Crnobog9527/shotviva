import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS } from '../../../../scripts/qa/personas'
import { QA_CLOCK_NAME_PREFIX } from '../../../../scripts/qa/test-clock-args'
import { createCheckout } from './checkout'
import { clearPriceCache } from './prices'
import { QA_CLOCK_PREFIX, QA_PERSONA_EMAILS, qaClockCustomer, qaTestClockAllowed } from './qa-test-clock'
import { deps, fakeStripe, sent, USER } from './test-checkout'

const PREVIEW = { VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_test_x' }
const TEST_SITE = 'https://shotviva-git-validation-preview-simons-projects-bfe3e99f.vercel.app'
const DOMAIN = 'shotviva.com'
const QA = 'qa-free@shotviva.com'

describe('qaTestClockAllowed (three guards)', () => {
  it('is on only on a preview deployment with a test key, off the production domain, for a QA persona', () => {
    expect(qaTestClockAllowed(PREVIEW, TEST_SITE, DOMAIN, QA)).toBe(true)
    expect(qaTestClockAllowed(PREVIEW, TEST_SITE, DOMAIN, ' QA-Free@Shotviva.com ')).toBe(true)
  })

  it('is always off in production, whatever else is configured', () => {
    for (const key of ['sk_test_x', 'sk_live_x', 'rk_test_x', undefined]) {
      for (const origin of [TEST_SITE, 'https://shotviva.com', 'https://www.shotviva.com']) {
        expect(qaTestClockAllowed({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: key }, origin, DOMAIN, QA)).toBe(false)
      }
    }
  })

  it('is off in development, without VERCEL_ENV, with a live or restricted key, or without a key', () => {
    expect(qaTestClockAllowed({ ...PREVIEW, VERCEL_ENV: 'development' }, TEST_SITE, DOMAIN, QA)).toBe(false)
    expect(qaTestClockAllowed({ STRIPE_SECRET_KEY: 'sk_test_x' }, TEST_SITE, DOMAIN, QA)).toBe(false)
    expect(qaTestClockAllowed({ ...PREVIEW, STRIPE_SECRET_KEY: 'sk_live_x' }, TEST_SITE, DOMAIN, QA)).toBe(false)
    expect(qaTestClockAllowed({ ...PREVIEW, STRIPE_SECRET_KEY: 'rk_test_x' }, TEST_SITE, DOMAIN, QA)).toBe(false)
    expect(qaTestClockAllowed({ VERCEL_ENV: 'preview' }, TEST_SITE, DOMAIN, QA)).toBe(false)
  })

  it('is off on the production domain or an unreadable origin, even on a preview with a test key', () => {
    for (const origin of ['https://shotviva.com', 'https://www.shotviva.com', 'https://SHOTVIVA.com/x', 'not a url']) {
      expect(qaTestClockAllowed(PREVIEW, origin, DOMAIN, QA)).toBe(false)
    }
  })

  it('is off for anyone who is not a QA persona', () => {
    for (const email of [null, '', 'buyer@example.com', 'qa-free@example.com', 'qa-somebody@shotviva.com']) {
      expect(qaTestClockAllowed(PREVIEW, TEST_SITE, DOMAIN, email)).toBe(false)
    }
  })

  it('lists exactly the QA personas, and the script looks for the same clock names', () => {
    expect([...QA_PERSONA_EMAILS].sort()).toEqual(Object.values(PERSONAS).map((p) => p.email).sort())
    expect(QA_CLOCK_NAME_PREFIX).toBe(QA_CLOCK_PREFIX)
  })
})

describe('qaClockCustomer', () => {
  it('puts a new customer on a new clock frozen at now, both keyed by the checkout token', async () => {
    const clocks = { create: vi.fn(async () => ({ id: 'clock_1' })) }
    const customers = { create: vi.fn(async () => ({ id: 'cus_1' })) }
    const stripe = { testHelpers: { testClocks: clocks }, customers } as never
    expect(await qaClockCustomer(stripe, { userId: USER, email: QA, token: 'tok', now: 1_800_000_000_500 })).toBe('cus_1')
    expect(clocks.create).toHaveBeenCalledWith({ frozen_time: 1_800_000_000, name: `shotviva-qa ${QA}` }, { idempotencyKey: 'qa-clock:tok' })
    expect(customers.create).toHaveBeenCalledWith(
      { email: QA, test_clock: 'clock_1', metadata: { user_id: USER, qa_test_clock: 'clock_1' } },
      { idempotencyKey: 'qa-clock-customer:tok' },
    )
  })
})

describe('createCheckout with the test-site hook', () => {
  beforeEach(() => clearPriceCache())

  it('checks a subscription out as the clock customer', async () => {
    const { stripe, create } = fakeStripe()
    const qaCustomer = vi.fn(async () => 'cus_clock')
    await createCheckout({ ...deps(stripe), qaCustomer }, { userId: USER, token: 'tok', body: { product_id: 'pro_monthly', method: 'card', locale: 'en' } })
    expect(qaCustomer).toHaveBeenCalledWith('tok')
    expect(sent(create)).toMatchObject({ mode: 'subscription', customer: 'cus_clock' })
  })

  it('leaves one-time payments and every buyer without the hook untouched', async () => {
    const { stripe, create } = fakeStripe()
    const qaCustomer = vi.fn(async () => 'cus_clock')
    await createCheckout({ ...deps(stripe), qaCustomer }, { userId: USER, body: { product_id: 'pack_s', method: 'card', locale: 'en' } })
    expect(qaCustomer).not.toHaveBeenCalled()
    expect(sent(create)).not.toHaveProperty('customer')
    await createCheckout(deps(stripe), { userId: USER, body: { product_id: 'pro_monthly', method: 'card', locale: 'en' } })
    expect(sent(create)).not.toHaveProperty('customer')
  })
})
