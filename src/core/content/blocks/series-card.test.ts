import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SeriesCard } from './series-card'

// SEO 2026-11-14: a series opens Create, which needs a session and is noindex. The card is a
// button carrying the address for the page's click handler, never a crawlable <a href>.
describe('series card', () => {
  const card = { id: 'series-1', name: 'Bright Daylight', use: 'Western dishes in daylight', series: { href: '/generate?series=western-bright-daylight', members: ['a'], count: 4 } }
  const media = { a: { before: 'https://shotviva.com/a-before.webp', after: 'https://shotviva.com/a-after.webp', live: true } }
  // Only the keys the card reads (core cannot import the site's message files).
  const messages = {
    marketing: {
      home: {
        seriesAria: '{name}, a series: {use}, {count} templates',
        beforeAlt: '{name}: phone photo',
        afterAlt: '{name}: {use}',
        phone: 'Phone',
        ai: 'AI',
        seriesCount: '{count} templates',
        seriesBadge: 'Series',
      },
    },
  }
  // The provider with its children passed positionally, as createElement takes them.
  const Provider = NextIntlClientProvider as ComponentType<{ locale: string; messages: typeof messages; children?: ReactNode }>
  const html = renderToStaticMarkup(
    createElement(Provider, { locale: 'en', messages }, createElement(SeriesCard, { card, media, sizes: '50vw' })),
  )

  it('is a button that carries the series address, with no link to Create', () => {
    expect(html).toMatch(/^<button type="button" data-open-series="\/generate\?series=western-bright-daylight" class="mk-tpl mk-series"/)
    expect(html).not.toMatch(/<a\b/)
    expect(html).not.toMatch(/href="\/generate/)
  })

  it('keeps the name, use and size of the set in the HTML', () => {
    expect(html).toContain('Bright Daylight')
    expect(html).toContain('Western dishes in daylight')
  })
})
