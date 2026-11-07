import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { CreditDials, dialFigures, ringValue } from '@/core/account/ui/credit-dials'
import { FilmStrip } from '@/core/account/ui/film-strip'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

// The account credit dials and this month's film strip (T48, comps-v3-b/account.html).

vi.mock('@/core/billing/paywall/paywall-context', () => ({ usePaywall: () => ({ open() {} }) }))

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

async function render(element: ReactElement, locale: 'en' | 'zh' = 'en') {
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, element))
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
}

const dials = (paid: number, free: number, allowance: { credits: number; interval: 'month' | 'year' } | null, giftRefused = false) =>
  createElement(CreditDials, { balance: { paid, free }, giftRefused, allowance, freeGift: site.billing.freeCredits })

const ring = (html: string, kind: string) => html.match(new RegExp(`data-dial="${kind}".*?--ring-v:(\\d+)`))?.[1]

describe('credit dials', () => {
  it('rings what is left of the period and of the signup gift', async () => {
    const { html, text } = await render(dials(38, 3, { credits: 50, interval: 'month' }))
    // "of N" sits next to the count; the line under it is one short phrase (Owner 2026-11-08).
    expect(text).toContain('38 / 50 paid private, no watermark')
    expect(text).toContain('3 / 6 free public, watermarked')
    expect(ring(html, 'paid')).toBe('76')
    expect(ring(html, 'free')).toBe('50')
    expect(html).toContain('aria-label="38 of 50 paid credits left"')
  })

  it('drops "of N" when the balance tops it, or there is no plan', async () => {
    const over = await render(dials(120, 0, { credits: 50, interval: 'month' }))
    expect(over.text).toContain('120 paid private, no watermark')
    expect(ring(over.html, 'paid')).toBe('100')
    const noPlan = await render(dials(0, 6, null))
    expect(ring(noPlan.html, 'paid')).toBe('0')
    expect(noPlan.html).toContain('aria-label="0 paid credits left"')
  })

  it('speaks Chinese', async () => {
    const { text } = await render(dials(500, 2, { credits: 600, interval: 'year' }), 'zh')
    expect(text).toContain('500 / 600 付费 私密、无水印')
    expect(text).toContain('2 / 6 免费 公开、带水印')
  })

  it('drops "/ 6" when the signup gift was withheld (same-IP rule), in both languages', async () => {
    const en = await render(dials(0, 0, null, true))
    expect(en.text).toContain('0 free public, watermarked')
    expect(en.text).not.toContain('/ 6')
    expect(en.html).toContain('aria-label="0 free credits left"')
    const zh = await render(dials(0, 0, null, true), 'zh')
    expect(zh.text).toContain('0 免费 公开、带水印')
    expect(zh.text).not.toContain('/ 6')
  })

  it('dialFigures: what each ring is measured against', () => {
    const month = { credits: 50, interval: 'month' as const }
    expect(dialFigures({ paid: 38, free: 3 }, month, 6, false)).toEqual({ paidOf: 50, freeOf: 6 })
    expect(dialFigures({ paid: 38, free: 0 }, month, 6, true)).toEqual({ paidOf: 50, freeOf: null })
    expect(dialFigures({ paid: 80, free: 9 }, month, 6, false)).toEqual({ paidOf: null, freeOf: null })
    expect(dialFigures({ paid: 0, free: 6 }, null, 6, false)).toEqual({ paidOf: null, freeOf: 6 })
  })

  it('ringValue clamps to 0–100', () => {
    expect(ringValue(0, 50)).toBe(0)
    expect(ringValue(75, 50)).toBe(100)
    expect(ringValue(3, null)).toBe(100)
  })
})

describe('film strip', () => {
  const fileUrl = (id: string) => `/api/files/${id}`

  it('shows the frames, links each into its photo and the rest into Photos', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const { html, text } = await render(createElement(FilmStrip, { ids, count: 12, fileUrl }))
    expect(text).toContain('This month · 12 photos')
    expect(html.match(/<img /g)).toHaveLength(7)
    expect(html).toContain('href="/photos/a"')
    expect(html).toContain('aria-label="5 more photos in Photos"')
    expect(text).toContain('+5')
  })

  it('no "+N" frame when everything fits; nothing at all for an empty month', async () => {
    expect((await render(createElement(FilmStrip, { ids: ['a'], count: 1, fileUrl }))).html).not.toContain('+')
    expect((await render(createElement(FilmStrip, { ids: [], count: 0, fileUrl }))).html).toBe('')
  })
})
