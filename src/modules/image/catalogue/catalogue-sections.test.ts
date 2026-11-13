import { describe, expect, it } from 'vitest'

import { catalogueSections, isTall, sectionsFor } from './catalogue-sections'
import type { CatalogueTemplate } from './catalogue-template'
import type { CatalogueSeries, FilterNode, GridEntry } from './catalogue-view'

const node = (slug: string, extra: Partial<FilterNode> = {}): FilterNode => ({ slug, name: slug.toUpperCase(), children: [], ...extra })
const template = (id: string, compare = false) =>
  ({ id, category: 'x', compare, cover: { before: 'b.webp', after: 'a.webp' } }) as unknown as CatalogueTemplate
const card = (id: string, path: string[], compare = false): GridEntry => ({ type: 'template', template: template(id, compare), path })
const series = (id: string, path: string[]): GridEntry => ({ type: 'series', series: { id, slug: id, members: [template(`${id}-m`)] } as CatalogueSeries, path })

const ids = (entries: readonly GridEntry[]) => entries.map((entry) => (entry.type === 'series' ? entry.series.id : entry.template.id))

describe('All as sections per root category (Owner 2026-11-12)', () => {
  // Catalogue order mixes categories; the chip tree is in 分类管理's order.
  const entries = [card('p1', ['pets']), card('f1', ['food', 'western']), series('s1', ['food']), card('a1', ['art'], true), card('f2', ['food', 'chinese']), card('p2', ['pets', 'dogs'])]
  const filters = [node('food', { key: 'food-drink', intro: 'Menus and dishes' }), node('art'), node('pets'), node('empty')]

  it('follows the category order, keeps catalogue order inside, and skips empty categories', () => {
    const sections = catalogueSections(filters, entries)
    expect(sections.map((section) => section.slug)).toEqual(['food', 'art', 'pets'])
    expect(ids(sections[0].entries)).toEqual(['f1', 's1', 'f2'])
    expect(ids(sections[2].entries)).toEqual(['p1', 'p2'])
  })

  it('carries the analytics key, the intro and the full count', () => {
    const [food, art] = catalogueSections(filters, entries)
    expect(food).toMatchObject({ key: 'food-drink', name: 'FOOD', intro: 'Menus and dishes', total: 3 })
    expect(art).toMatchObject({ key: 'art', intro: null, total: 1 })
  })

  it('caps the cards a section draws but counts them all', () => {
    const many = Array.from({ length: 11 }, (_, i) => card(`f${i}`, ['food']))
    const [food] = catalogueSections([node('food')], many)
    expect(food.entries).toHaveLength(6)
    expect(food.total).toBe(11)
    expect(catalogueSections([node('food')], many, 3)[0].entries).toHaveLength(3)
  })

  it('marks a section of tall compare cards only when every card is one', () => {
    const [food, art, pets] = catalogueSections(filters, entries)
    expect([food.compare, art.compare, pets.compare]).toEqual([false, true, false])
    const mixed = catalogueSections([node('art')], [card('a1', ['art'], true), series('s2', ['art'])])
    expect(mixed[0].compare).toBe(false)
    expect(isTall(card('a1', ['art'], true))).toBe(true)
  })
})

describe('when All shows sections', () => {
  const two = catalogueSections([node('food'), node('pets')], [card('f', ['food']), card('p', ['pets'])])
  it('only on All with two or more categories', () => {
    expect(sectionsFor({ saved: false, path: [] }, two)).toBe(two)
    expect(sectionsFor({ saved: false, path: ['food'] }, two)).toBeNull()
    expect(sectionsFor({ saved: true, path: [] }, two)).toBeNull()
    expect(sectionsFor({ saved: false, path: [] }, two.slice(0, 1))).toBeNull()
  })
})
