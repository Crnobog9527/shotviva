import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { StripeApi } from '../stripe/client'
import { isStripeUrl, resolvePaymentDocument } from './resolve'

const USER = '11111111-1111-4111-8111-111111111111'
const RECEIPT = 'https://pay.stripe.com/receipts/payment/abc'
const PDF = 'https://pay.stripe.com/invoice/acct_1/test_x/pdf'
const HOSTED = 'https://invoice.stripe.com/i/acct_1/test_x'

type Row = Record<string, unknown> | null

// payments, answering one row when asked by id for its owner; records every filter.
function fakeDb(row: Row) {
  const filters: [string, unknown][] = []
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => (filters.push([column, value]), query),
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return { db: { from: () => query } as unknown as SupabaseClient, filters }
}

const stripeRow = (overrides: Record<string, unknown> = {}) => ({
  channel: 'stripe',
  stripe_session_id: 'cs_test_1',
  stripe_invoice_id: null,
  stripe_charge_id: 'ch_1',
  ...overrides,
})

function fakeStripe(over: { charge?: unknown; invoice?: unknown; session?: unknown } = {}) {
  const answer = (value: unknown) =>
    vi.fn(async () => {
      if (value instanceof Error) throw value
      return value
    })
  const charges = answer(over.charge ?? { id: 'ch_1', receipt_url: RECEIPT })
  const invoices = answer(over.invoice ?? { id: 'in_1', invoice_pdf: PDF, hosted_invoice_url: HOSTED })
  const sessions = answer(over.session ?? { id: 'cs_test_1', payment_intent: { id: 'pi_1', latest_charge: 'ch_9' } })
  const stripe = { charges: { retrieve: charges }, invoices: { retrieve: invoices }, checkout: { sessions: { retrieve: sessions } } } as unknown as StripeApi
  return { stripe, charges, invoices, sessions }
}

function run(row: Row, document: string, stripe = fakeStripe(), paymentId = '42') {
  const { db, filters } = fakeDb(row)
  const getStripe = vi.fn(() => stripe.stripe)
  const result = resolvePaymentDocument({ db, stripe: getStripe }, { userId: USER, paymentId, document })
  return { result, filters, getStripe, ...stripe }
}

describe('resolvePaymentDocument: ownership and Stripe links (T80)', () => {
  it('reads the row by id for the signed-in user only', async () => {
    const { result, filters } = run(stripeRow(), 'receipt')
    await expect(result).resolves.toBe(RECEIPT)
    expect(filters).toEqual([
      ['id', '42'],
      ['user_id', USER],
    ])
  })

  it("refuses someone else's payment as not found, without asking Stripe", async () => {
    const { result, getStripe } = run(null, 'receipt')
    await expect(result).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(getStripe).not.toHaveBeenCalled()
  })

  it('refuses a made-up id or document before reading anything', async () => {
    await expect(run(stripeRow(), 'receipt', fakeStripe(), '42 or 1=1').result).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(run(stripeRow(), 'refund').result).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('a card, 中国银行卡 or Alipay payment: the charge receipt, fresh from Stripe', async () => {
    const { result, charges } = run(stripeRow({ stripe_charge_id: 'py_alipay' }), 'receipt')
    await expect(result).resolves.toBe(RECEIPT)
    expect(charges).toHaveBeenCalledWith('py_alipay')
  })

  it('WeChat Pay (T73) is a one-time charge like Alipay: its receipt, no invoice', async () => {
    const row = stripeRow({ stripe_charge_id: 'py_wechat' })
    const { result, charges } = run(row, 'receipt')
    await expect(result).resolves.toBe(RECEIPT)
    expect(charges).toHaveBeenCalledWith('py_wechat')
    await expect(run(row, 'invoice').result).resolves.toBeNull()
  })

  it('no invoice on a one-time payment that has none', async () => {
    const { result, invoices } = run(stripeRow(), 'invoice')
    await expect(result).resolves.toBeNull()
    expect(invoices).not.toHaveBeenCalled()
  })

  it('a subscription payment or renewal, or a Managed Payments pack: the invoice PDF', async () => {
    const { result, invoices } = run(stripeRow({ stripe_session_id: null, stripe_invoice_id: 'in_1' }), 'invoice')
    await expect(result).resolves.toBe(PDF)
    expect(invoices).toHaveBeenCalledWith('in_1')
  })

  it('the hosted invoice page while the PDF is not ready', async () => {
    const stripe = fakeStripe({ invoice: { id: 'in_1', invoice_pdf: null, hosted_invoice_url: HOSTED } })
    await expect(run(stripeRow({ stripe_invoice_id: 'in_1' }), 'invoice', stripe).result).resolves.toBe(HOSTED)
  })

})

describe('resolvePaymentDocument: older rows, Waffo, failures (T80)', () => {
  it('finds the charge through the invoice when the row has no charge id', async () => {
    const invoice = { id: 'in_1', payments: { data: [{ status: 'paid', payment: { charge: 'ch_from_invoice' } }] } }
    const { result, charges } = run(stripeRow({ stripe_charge_id: null, stripe_invoice_id: 'in_1' }), 'receipt', fakeStripe({ invoice }))
    await expect(result).resolves.toBe(RECEIPT)
    expect(charges).toHaveBeenCalledWith('ch_from_invoice')
  })

  it("finds the charge through the session's PaymentIntent otherwise", async () => {
    const { result, charges } = run(stripeRow({ stripe_charge_id: null }), 'receipt')
    await expect(result).resolves.toBe(RECEIPT)
    expect(charges).toHaveBeenCalledWith('ch_9')
  })

  it('Waffo: nothing to open, and Stripe is never asked', async () => {
    const row = { channel: 'waffo', stripe_session_id: null, stripe_invoice_id: null, stripe_charge_id: null }
    const { result, getStripe } = run(row, 'receipt')
    await expect(result).resolves.toBeNull()
    expect(getStripe).not.toHaveBeenCalled()
  })

  it('Stripe failing or answering without a link reads as nothing to open', async () => {
    await expect(run(stripeRow(), 'receipt', fakeStripe({ charge: new Error('stripe down') })).result).resolves.toBeNull()
    await expect(run(stripeRow(), 'receipt', fakeStripe({ charge: { id: 'ch_1', receipt_url: null } })).result).resolves.toBeNull()
  })

  it('never sends the buyer anywhere but Stripe', async () => {
    const stripe = fakeStripe({ charge: { id: 'ch_1', receipt_url: 'https://evil.example/receipt' } })
    await expect(run(stripeRow(), 'receipt', stripe).result).resolves.toBeNull()
    expect(isStripeUrl(RECEIPT)).toBe(true)
    expect(isStripeUrl(HOSTED)).toBe(true)
    expect(isStripeUrl('http://pay.stripe.com/x')).toBe(false)
    expect(isStripeUrl('https://stripe.com.evil.example/x')).toBe(false)
  })
})
