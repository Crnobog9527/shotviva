import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SeriesCard } from './series-card'
import { pairsIn, pictureAttrs } from './series-layers'

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

  it('draws only the first pair and carries the card key, not the later covers, for the browser', () => {
    const three = { ...card, series: { ...card.series, members: ['a', 'b', 'c'] } }
    const covers = {
      ...media,
      b: { before: 'https://shotviva.com/b-before.webp', after: 'https://shotviva.com/b-after.webp', live: true },
      c: { before: 'https://shotviva.com/c-before.webp', after: 'https://shotviva.com/c-after.webp', live: true },
    }
    const markup = renderToStaticMarkup(createElement(Provider, { locale: 'en', messages }, createElement(SeriesCard, { card: three, media: covers, sizes: '50vw' })))
    // The first pair's two pictures; their blurred fills are empty spans painted in the browser.
    expect(markup.match(/<img /g)).toHaveLength(2)
    expect(markup.match(/data-cover-fill/g)).toHaveLength(2)
    expect(markup).not.toContain('mk-sl')
    expect(markup).not.toContain('b-before')
    expect(markup).not.toContain('c-after')
    expect(markup).toContain('data-series-more="series-1"')
    expect(markup).toContain('data-series-sizes="50vw"')
  })

  it('leaves a one-pair series still: no addresses to play through', () => {
    expect(html).not.toContain('data-series-more')
  })

  it('gives a browser-drawn layer the srcset the server gives the first pair', () => {
    const server = /<img[^>]*class="mk-sb"[^>]*>/.exec(html)?.[0] ?? ''
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(server)?.[1].replaceAll('&amp;', '&')
    const built = pictureAttrs('https://shotviva.com/a-before.webp', '50vw')
    expect(built.srcSet).toContain('/_next/image?url=')
    expect(built.srcSet).toBe(attr('srcSet') ?? attr('srcset'))
    expect(built.src).toBe(attr('src'))
    expect(built.sizes).toBe(attr('sizes'))
  })
})

describe('series layer addresses', () => {
  it('ignores anything that is not a list of before/after pairs', () => {
    expect(pairsIn(null)).toEqual([])
    expect(pairsIn('not a list')).toEqual([])
    expect(pairsIn({ a: 1 })).toEqual([])
    expect(pairsIn([['a', 'b'], ['c'], [1, 2], 'x'])).toEqual([['a', 'b']])
  })

})

describe('bundle card pairs', () => {
  it('keeps only pairs that name their template, so a stale cached answer cannot show one template and pick another', async () => {
    const { bundlePairs } = await import('./series-layers')
    expect(bundlePairs([['b1', 'a1'], ['b2', 'a2', 't2'], ['b3', 'a3', '']])).toEqual([['b2', 'a2', 't2']])
  })
})
