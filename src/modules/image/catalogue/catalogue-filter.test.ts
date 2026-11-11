import { describe, expect, it } from 'vitest'

import { ALL, chipRows, createReturnPath, filterCatalogue, openableTemplates, readSelection, resolvePath, selectionSearch } from './catalogue-filter'
import type { CatalogueTemplate } from './catalogue-template'
import type { CatalogueSeries, FilterNode, GridEntry } from './catalogue-view'

const node = (slug: string, children: FilterNode[] = []): FilterNode => ({ slug, name: slug.toUpperCase(), children })
// Two parents reuse the slug "dark": matching is by position, never by membership.
const filters = [node('food', [node('dark', [node('chinese')]), node('bright')]), node('pets', [node('dark')]), node('art')]

const template = (id: string) => ({ id, category: 'x' }) as CatalogueTemplate
const a = template('a')
const b = template('b')
const m1 = template('m1')
const m2 = template('m2')
const series = { id: 's1', slug: 'menu-set', members: [m1, m2] } as CatalogueSeries
const entries: GridEntry[] = [
  { type: 'series', series, path: ['food', 'dark'] },
  { type: 'template', template: a, path: ['food', 'dark', 'chinese'] },
  { type: 'template', template: b, path: ['pets'] },
]

describe('category path from the address (T102)', () => {
  it('keeps the deepest known prefix, level by level', () => {
    expect(resolvePath(filters, ['food', 'dark', 'chinese'])).toEqual(['food', 'dark', 'chinese'])
    expect(resolvePath(filters, ['food', 'nope', 'chinese'])).toEqual(['food'])
    expect(resolvePath(filters, ['pets', 'dark', 'chinese'])).toEqual(['pets', 'dark'])
    expect(resolvePath(filters, ['dark'])).toEqual([])
    expect(resolvePath(filters, ['food', 'dark', 'chinese', 'more'])).toEqual(['food', 'dark', 'chinese'])
  })

  it('reads ?category=, ?saved=1 and falls back to All', () => {
    expect(readSelection(new URLSearchParams('category=food/dark'), filters)).toEqual({ saved: false, path: ['food', 'dark'] })
    expect(readSelection(new URLSearchParams('category=food%2Fbright'), filters)).toEqual({ saved: false, path: ['food', 'bright'] })
    expect(readSelection(new URLSearchParams('saved=1&category=food'), filters)).toEqual({ saved: true, path: [] })
    expect(readSelection(new URLSearchParams('category=%3Cscript%3E'), filters)).toEqual(ALL)
    expect(readSelection(new URLSearchParams(''), filters)).toEqual(ALL)
  })

  it('writes a readable, shareable query and keeps other parameters', () => {
    const current = new URLSearchParams('favorite=a&category=pets&series=old')
    expect(selectionSearch(current, { saved: false, path: ['food', 'dark'] }, null)).toBe('?favorite=a&category=food/dark')
    expect(selectionSearch(current, { saved: true, path: [] }, null)).toBe('?favorite=a&saved=1')
    expect(selectionSearch(new URLSearchParams('category=food'), ALL, null)).toBe('')
    expect(selectionSearch(new URLSearchParams('category=food'), { saved: false, path: ['food'] }, 'menu-set')).toBe('?category=food&series=menu-set')
    // The open series is kept unless told otherwise.
    expect(selectionSearch(new URLSearchParams('series=menu-set'), ALL)).toBe('?series=menu-set')
  })

  it('opens a chip row under each chosen level that has children', () => {
    expect(chipRows(filters, []).map((row) => row.map((n) => n.slug))).toEqual([['food', 'pets', 'art']])
    expect(chipRows(filters, ['food']).map((row) => row.map((n) => n.slug))).toEqual([['food', 'pets', 'art'], ['dark', 'bright']])
    expect(chipRows(filters, ['food', 'dark']).at(-1)?.map((n) => n.slug)).toEqual(['chinese'])
    expect(chipRows(filters, ['food', 'bright'])).toHaveLength(2)
    expect(chipRows(filters, ['art'])).toHaveLength(1)
  })
})

describe('catalogue filter (ARCHITECTURE §5, §5.1b)', () => {
  it('shows everything, or a category with everything below it', () => {
    expect(filterCatalogue(entries, [], ALL).shown).toEqual(entries)
    expect(filterCatalogue(entries, [], { saved: false, path: ['food'] }).shown).toEqual(entries.slice(0, 2))
    expect(filterCatalogue(entries, [], { saved: false, path: ['food', 'dark', 'chinese'] }).shown).toEqual([entries[1]])
    expect(filterCatalogue(entries, [], { saved: false, path: ['art'] }).shown).toEqual([])
  })

  it('lists saved templates in saved order, series members included', () => {
    const { active, shown } = filterCatalogue(entries, [m2, a], { saved: true, path: [] })
    expect(active.saved).toBe(true)
    expect(shown.map((entry) => entry.type === 'template' && entry.template.id)).toEqual(['m2', 'a'])
  })

  it('falls back to All once the last saved template is removed', () => {
    expect(filterCatalogue(entries, [], { saved: true, path: [] })).toEqual({ active: ALL, shown: entries })
  })

  it('can open every grid template and every series member, once each', () => {
    const twice: GridEntry[] = [...entries, { type: 'template', template: m1, path: ['pets'] }]
    expect(openableTemplates(twice).map((t) => t.id)).toEqual(['m1', 'm2', 'a', 'b'])
  })
})

// A signed-out visitor who opened a series from a public card comes back to that series.
describe('Create return path after sign-in', () => {
  it('keeps a series slug or id', () => {
    expect(createReturnPath('qa-t102-dark-menu')).toBe('/generate?series=qa-t102-dark-menu')
    expect(createReturnPath('3fa01bf9-3692-49f5-9347-7e32b3aab260')).toBe('/generate?series=3fa01bf9-3692-49f5-9347-7e32b3aab260')
  })

  it('drops anything else, so no other text rides into next', () => {
    for (const bad of [undefined, '', ['a', 'b'], 'Dark Menu', 'a&next=//evil.example', '../admin', 'x'.repeat(81)]) {
      expect(createReturnPath(bad as string | string[] | undefined)).toBe('/generate')
    }
  })
})
