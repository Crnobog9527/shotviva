import { describe, expect, it } from 'vitest'

import { purchaseLines, type DocumentRow } from './lines'

const row = (overrides: Partial<DocumentRow>): DocumentRow => ({ id: '7', channel: 'stripe', status: 'paid', hasInvoice: false, ...overrides })

describe('purchase lines (T80)', () => {
  it('every Stripe payment gets a receipt; only rows with an invoice get one', () => {
    const [pack, plan] = purchaseLines(
      [row({ id: '7' }), row({ id: '8', hasInvoice: true })],
      [
        { value: '7', label: 'Credit pack' },
        { value: '8', label: 'Pro · Monthly' },
      ],
      'en',
    )
    expect(pack).toEqual({ value: '7', label: 'Credit pack', receiptHref: '/account/purchases/7/receipt', invoiceHref: null, refund: null })
    expect(plan?.invoiceHref).toBe('/account/purchases/8/invoice')
  })

  it('links stay in the page language', () => {
    const [line] = purchaseLines([row({ hasInvoice: true })], [{ value: '7', label: 'x' }], 'zh')
    expect(line).toMatchObject({ receiptHref: '/zh/account/purchases/7/receipt', invoiceHref: '/zh/account/purchases/7/invoice' })
  })

  it('Waffo rows have no links (the email note shows instead)', () => {
    const [line] = purchaseLines([row({ channel: 'waffo', hasInvoice: false })], [{ value: '7', label: 'x' }], 'en')
    expect(line).toMatchObject({ receiptHref: null, invoiceHref: null })
  })

  it('refunded rows keep their links and carry the mark', () => {
    const [full, partial, disputed] = purchaseLines(
      [row({ id: '1', status: 'refunded' }), row({ id: '2', status: 'partially_refunded' }), row({ id: '3', status: 'disputed' })],
      [],
      'en',
    )
    expect(full).toMatchObject({ refund: 'full', receiptHref: '/account/purchases/1/receipt' })
    expect(partial?.refund).toBe('partial')
    expect(disputed?.refund).toBeNull()
  })
})
