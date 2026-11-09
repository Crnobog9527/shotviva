import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import type { Translate } from '@/core/translate'
import messages from '@/site/messages/en.json'
import { site } from '@/site/site.config'

import { formatMoney, paymentChoices, workChoices } from '@/core/support'

const t = createTranslator({ locale: 'en', messages, namespace: 'app.support' as 'app' }) as unknown as Translate

// The Help & feedback pickers (T27) worded with the real English messages and products.
describe('submit form pickers', () => {
  it('words each payment by product, amount charged and date', () => {
    const [plan, pack] = paymentChoices(
      [
        { id: '7', productId: 'pro_yearly', amountTotal: 34900, currency: 'usd', method: 'card', createdAt: '2026-11-01T12:00:00Z', channel: 'stripe', status: 'paid', hasInvoice: true },
        { id: '8', productId: 'pack_m', grantedCredits: 55, amountTotal: 2490, currency: 'usd', method: 'card', createdAt: '2026-11-02T12:00:00Z', channel: 'stripe', status: 'paid', hasInvoice: false },
      ],
      site.billing.products,
      t,
      { money: formatMoney('en') },
    )
    expect(plan).toEqual({ value: '7', label: 'Pro · Yearly · $349.00 · Nov 1, 2026' })
    expect(pack?.label).toBe('Credit pack · 55 credits · $24.90 · Nov 2, 2026')
  })

  it('words each work by template, date and reference number (T78)', () => {
    const id = '2fa821c6-1a2b-4c3d-8e4f-000000000001'
    expect(workChoices([{ id, templateName: 'Pure White', createdAt: '2026-11-03T12:00:00Z' }], t)).toEqual([
      { value: id, ref: '2fa821c6', label: 'Pure White · Nov 3, 2026 · 2fa821c6' },
    ])
    // A longer number from the server (another job shares the first 8) is used as is.
    const refs = new Map([[id, '2fa821c6-1a2b']])
    expect(workChoices([{ id, templateName: 'Pure White', createdAt: '2026-11-03T12:00:00Z' }], t, refs)[0]).toMatchObject({
      ref: '2fa821c6-1a2b',
      label: 'Pure White · Nov 3, 2026 · 2fa821c6-1a2b',
    })
  })
})

describe('reply time copy (T27b)', () => {
  it('promises only what the tier gets', () => {
    expect(t('replyTime', { hours: 48 })).toBe('We reply here, usually within 48 hours.')
    expect(t('replyTimeMax', { hours: 24 })).toBe('Max members get a reply within 24 hours.')
  })
})
