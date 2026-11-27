import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { CatalogueSection } from './catalogue-sections'
import type { CatalogueTemplate } from './catalogue-template'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const { DeferCoversUntilNear } = await import('./near-viewport')
const { CatalogueSections } = await import('./catalogue-sections-view')
const { FeatureCard } = await import('./feature-card')

const tpl = (id: string, type: 'image' | 'video' = 'image'): CatalogueTemplate => ({
  id,
  name: id,
  category: 'food',
  categoryName: 'Food',
  categoryOrder: 10,
  compare: false,
  description: null,
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 },
  copyFields: [],
  toggles: [],
  cover: { type, before: `https://assets.test/${id}-b.webp`, after: `https://assets.test/${id}-a.webp`, motion: null, poster: null },
})
const section = (ids: string[]): CatalogueSection => ({ slug: 'food', key: 'food', name: 'Food', intro: null, total: ids.length, entries: ids.map((id) => ({ type: 'template', template: tpl(id) })) as CatalogueSection['entries'], compare: false })
const noop = () => undefined
const highImgs = (html: string) => (html.match(/<img\b[^>]*>/g) ?? []).filter((tag) => /fetchpriority="high"/i.test(tag))
const sections = (firstPriority?: boolean) =>
  renderToStaticMarkup(createElement(DeferCoversUntilNear, null, createElement(CatalogueSections, { sections: [section(['one', 'two', 'three'])], ...(firstPriority === undefined ? {} : { firstPriority }), onOpen: noop, onOpenSeries: noop, onSeeAll: noop })))

// Review of #891: with a featured video template on top, the featured card is the largest paint on a
// phone, so it, not the first section card, gets the high priority.
describe('the first screen’s high priority', () => {
  it('goes to the first section card when there is no featured card, and only to it', () => {
    const tags = highImgs(sections())
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) expect(tag).toMatch(/one-[ab]/)
  })

  it('leaves the section cards at normal priority when the featured card sits above', () => {
    expect(highImgs(sections(false))).toEqual([])
  })

  it('goes to the featured card', () => {
    const html = renderToStaticMarkup(createElement(FeatureCard, { template: tpl('feature', 'video'), onOpen: noop }))
    expect(highImgs(html).length).toBeGreaterThan(0)
  })
})
