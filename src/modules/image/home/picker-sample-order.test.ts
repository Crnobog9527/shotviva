import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// With the pre-sized copies on, as in production: every plate is a <picture> (core/ui/picture.tsx).
const BASE = 'https://shotviva.com/assets'
vi.stubEnv('NEXT_PUBLIC_ASSETS_BASE_URL', BASE)
vi.stubEnv('NEXT_PUBLIC_PRESIZED_IMAGES_URL', 'https://img-eo.shotviva.com')
const { PickerSample } = await import('./picker-body')
const { sampleFor } = await import('./home-samples')

const BEFORE = `${BASE}/covers/dessert-truffle-26/before-aaaaaaaaaaaaaaaa.webp`
const AFTER = `${BASE}/covers/dessert-truffle-26/after-bbbbbbbbbbbbbbbb.webp`
const template = { id: 't1', name: 'Truffles', category: 'food', categoryName: 'Food', description: null, cover: { before: BEFORE, after: AFTER, poster: null } } as unknown as CatalogueTemplate

const messages = {
  en: { app: { template: { cardAlt: '{name} example', example: 'Real example', phone: 'Phone', ai: 'AI' } }, marketing: { home: { phone: 'Real phone photo', ai: 'AI' } } },
  zh: { app: { template: { cardAlt: '{name}案例', example: '真实案例', phone: '原图', ai: 'AI' } }, marketing: { home: { phone: '真实手机照', ai: 'AI' } } },
}
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: (typeof messages)['en']; timeZone: string }>
const render = (locale: 'en' | 'zh') =>
  renderToStaticMarkup(createElement(Intl, { locale, messages: messages[locale], timeZone: 'UTC' }, createElement(PickerSample, { selected: template, sampleOf: sampleFor })))

// The pair is a two-column grid (marketing.css .mk-pair): its box children fill the cells in order.
// A <source> under a display: contents <picture> was such a child (Owner 2026-11-25: empty left
// plate, phone photo under the AI tag), so the cells are read here as the browser lays them out.
function cells(html: string): string[] {
  const pair = /<span class="mk-pair[^"]*">([\s\S]*)<\/span><\/div>/.exec(html)?.[1] ?? ''
  return [...pair.matchAll(/<(source|img)\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => !/style="display:none"/.test(tag))
}

describe('template picker sample: phone photo left, AI cover right', () => {
  for (const locale of ['en', 'zh'] as const) {
    it(`lays the before cover in the first cell and the after cover in the second (${locale})`, () => {
      const html = render(locale)
      expect(html).toContain('<picture')
      const [left, right, ...rest] = cells(html)
      expect(rest).toEqual([])
      expect(left).toMatch(/class="mk-b"/)
      expect(left).toContain('before-aaaa')
      expect(right).toMatch(/class="mk-a/)
      expect(right).toContain('after-bbbb')
    })
  }

  it('labels the left plate as the real phone photo and the right one AI, in both languages', () => {
    expect(render('en')).toMatch(/mk-tag-l[^>]*>Real phone photo<[\s\S]*mk-tag-r[^>]*>AI</)
    expect(render('zh')).toMatch(/mk-tag-l[^>]*>真实手机照<[\s\S]*mk-tag-r[^>]*>AI</)
  })
})
