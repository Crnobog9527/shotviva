import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Translate } from '@/core/translate'
import messages from '@/site/messages/en.json'
import { site } from '@/site/site.config'

import { formatMoney, paymentChoices, workChoices } from '@/core/support'
import { AttachmentField, offeredPayments } from '@/core/support/ui/attachment-field'

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

// 2033 (Owner 2026-11-28): an org-pool purchase has no self-service refund.
describe('org-pool purchases in the refund picker', () => {
  const options = [
    { id: '9', productId: 'pack_s', amountTotal: 990, currency: 'usd', method: 'card', createdAt: '2026-11-02T12:00:00Z', channel: 'stripe', status: 'paid', hasInvoice: false, orgPool: true },
    { id: '10', productId: 'pack_s', amountTotal: 990, currency: 'usd', method: 'card', createdAt: '2026-11-03T12:00:00Z', channel: 'stripe', status: 'paid', hasInvoice: false },
  ] as const
  const choices = paymentChoices(options, site.billing.products, t, { money: formatMoney('en') })
  // children as createElement's third argument (react/no-children-prop) needs it optional here.
  const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown }>

  it('marks the org-pool payment, and only it', () => {
    expect(choices.map((choice) => choice.noRefund ?? false)).toEqual([true, false])
  })

  it('leaves it out of a refund request, with the note, and keeps it for billing', () => {
    expect(offeredPayments('refund', choices).map((choice) => choice.value)).toEqual(['10'])
    expect(offeredPayments('billing', choices).map((choice) => choice.value)).toEqual(['9', '10'])
    const html = (type: 'refund' | 'billing', payments: typeof choices) => renderToStaticMarkup(
      createElement(Intl, { locale: 'en', messages }, createElement(AttachmentField, { type, payments, works: [] })))
    // Rendered HTML escapes the apostrophes; compare the escaped note.
    const note = t('new.orgPoolNoRefund').replaceAll("'", '&#x27;')
    const refund = html('refund', choices)
    expect(refund).toContain('value="10"')
    expect(refund).not.toContain('value="9"')
    expect(refund).toContain(note)
    expect(html('billing', choices)).toContain('value="9"')
    // Only org-pool purchases: no picker, just the note.
    const only = html('refund', choices.slice(0, 1))
    expect(only).not.toContain('<select')
    expect(only).toContain(note)
  })
})

describe('reply time copy (T27b)', () => {
  it('promises only what the tier gets', () => {
    expect(t('replyTime', { hours: 48 })).toBe('We reply here, usually within 48 hours.')
    expect(t('replyTimeMax', { hours: 24 })).toBe('Max members get a reply within 24 hours.')
  })
})
