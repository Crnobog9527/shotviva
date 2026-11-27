import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CategoryChips } from './category-chips'
import type { FilterNode } from './catalogue-view'

const filters = [{ slug: 'food', name: 'Food', children: [{ slug: 'western', name: 'Western', children: [{ slug: 'snacks', name: 'Snacks', children: [] }] }] }] as unknown as FilterNode[]
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: object; timeZone: string }>
const render = (rail: boolean) =>
  renderToStaticMarkup(createElement(Intl, { locale: 'en', messages: { app: { favorites: { saved: 'Saved' } } }, timeZone: 'UTC' },
    createElement(CategoryChips, { filters, saved: false, value: { saved: false, path: ['food', 'western'] }, onChange: () => {}, labels: { all: 'All', filter: 'Filter', filterWithin: (n: string) => `Within ${n}` }, rail })))

// The home picker keeps each of the three levels on one sideways-scrolling line (Owner 2026-11-25);
// Create still wraps them from md up.
describe('category chips rail', () => {
  it('never wraps a level in rail mode', () => {
    const html = render(true)
    expect(html.match(/role="group"/g)).toHaveLength(3)
    expect(html).not.toContain('md:flex-wrap')
  })
  it('wraps from md up elsewhere', () => {
    expect(render(false)).toContain('md:flex-wrap')
  })
})
