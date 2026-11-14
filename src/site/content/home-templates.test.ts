import { describe, expect, it } from 'vitest'

import { FALLBACK_COUNT, SERIES_PAIRS, featuredSections, featuredTemplates, seriesHref, tryTemplates } from './home-templates'

// What localizeTemplate attaches from template_categories (T75): name and intro in the page's
// language, its place in the 分类管理 order, and whether it is the drag compare.
const CATEGORIES = {
  'art-styles': { key: 'art-styles', name: 'Art Styles', intro: 'Drawings.', compare: true, sortOrder: 10 },
  'food-drink': { key: 'food-drink', name: 'Food & Drink', intro: 'Dishes.', compare: false, sortOrder: 20 },
  pets: { key: 'pets', name: '宠物', intro: '', compare: false, sortOrder: 60 },
  fresh: { key: 'fresh', name: 'Fresh', intro: 'Added in admin.', compare: false, sortOrder: 70 },
} as const
type Key = keyof typeof CATEGORIES

let day = 0
const live = (id: string, category: Key, extra: { rank?: number; covers?: boolean; description?: string } = {}) => ({
  id,
  name: `Name ${id}`,
  description: extra.description ?? `Use of ${id}`,
  category,
  categoryView: CATEGORIES[category],
  coverBeforeUrl: extra.covers === false ? null : `https://shotviva.com/assets/covers/${id}/b.webp`,
  coverAfterUrl: extra.covers === false ? null : `https://shotviva.com/assets/covers/${id}/a.webp`,
  featuredRank: extra.rank ?? null,
  createdAt: `2026-11-${String(++day).padStart(2, '0')}T00:00:00Z`,
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 },
})

// T53, ARCHITECTURE §12 home item 3.
describe('featured templates from the database', () => {
  it('uses the admin\'s featured list in rank order', () => {
    const rows = [live('a', 'pets', { rank: 2 }), live('b', 'pets'), live('c', 'food-drink', { rank: 1 })]
    expect(featuredTemplates(rows).map((t) => t.id)).toEqual(['c', 'a'])
  })

  it('falls back to the six most recently published when nothing is featured', () => {
    const rows = Array.from({ length: 8 }, (_, i) => live(`t${i}`, 'pets'))
    expect(featuredTemplates(rows).map((t) => t.id)).toEqual(['t7', 't6', 't5', 't4', 't3', 't2'].slice(0, FALLBACK_COUNT))
  })

  // T75: names, intros and order come from 分类管理; the drag compare follows card_style.
  it('groups in the admin\'s category order with the stored names and intros, hiding empty ones', () => {
    const rows = [live('new', 'fresh', { rank: 1 }), live('pet', 'pets', { rank: 2 }), live('art', 'art-styles', { rank: 3 }), live('dish', 'food-drink', { rank: 4 })]
    const { categories, media, defaultId } = featuredSections(rows)
    expect(categories.map((c) => c.name)).toEqual(['Art Styles', 'Food & Drink', '宠物', 'Fresh'])
    expect(categories.map((c) => c.intro)).toEqual(['Drawings.', 'Dishes.', '', 'Added in admin.'])
    expect(categories.map((c) => c.drag === true)).toEqual([true, false, false, false])
    // Name and use only: the marketing cards carry no price (DESIGN, Owner 2026-11-08).
    expect(categories[0]?.templates).toEqual([{ id: 'art', name: 'Name art', use: 'Use of art' }])
    expect(media.pet).toEqual({ before: 'https://shotviva.com/assets/covers/pet/b.webp', after: 'https://shotviva.com/assets/covers/pet/a.webp', live: true })
    expect(defaultId).toBe('new')
  })

  it('keeps a landing page to its own category keys and opens its generator on the first of them', () => {
    const rows = [live('pet', 'pets', { rank: 1 }), live('dish', 'food-drink', { rank: 2 }), live('dish2', 'food-drink', { rank: 3 })]
    const { categories, defaultId } = featuredSections(rows, ['food-drink'])
    expect(categories.map((c) => c.templates.map((t) => t.id))).toEqual([['dish', 'dish2']])
    expect(defaultId).toBe('dish')
  })

  it('offers the 404 only templates with both covers, never a compare category', () => {
    const rows = [live('art', 'art-styles', { rank: 1 }), live('bare', 'pets', { rank: 2, covers: false }), live('pet', 'pets', { rank: 3 })]
    expect(tryTemplates(rows).map((t) => t.id)).toEqual(['pet'])
  })
})

// T102 series on the public sections (Owner 2026-11-12): one card per series, where its first
// featured member stands, picturing its members in series order.
const series = (id: string, memberIds: string[], showMembers = false) => ({ id, slug: `${id}-set`, name: `Series ${id}`, description: `All of ${id}`, showMembers, memberIds })

describe('series on the template sections', () => {
  it('collapses featured members into one series card at the first member\'s place, in admin order', () => {
    const rows = [live('solo', 'food-drink', { rank: 1 }), live('m2', 'food-drink', { rank: 2 }), live('other', 'food-drink', { rank: 3 }), live('m1', 'food-drink', { rank: 4 }), live('m3', 'food-drink')]
    const { categories, media, defaultId } = featuredSections(rows, undefined, [series('s', ['m1', 'm2', 'gone', 'm3'])])
    expect(categories[0]?.templates.map((card) => card.id)).toEqual(['solo', 'series-s', 'other'])
    expect(categories[0]?.templates[1]).toEqual({
      id: 'series-s', name: 'Series s', use: 'All of s',
      series: { href: '/generate?series=s-set', members: ['m1', 'm2', 'm3'], count: 3 },
    })
    // Not in the live catalogue (not on sale): neither pictured nor counted.
    // The pictured members' covers are in the lookup, the unfeatured m3 included.
    expect(Object.keys(media).sort()).toEqual(['m1', 'm2', 'm3', 'other', 'solo'])
    expect(defaultId).toBe('solo')
  })

  it('keeps members as their own cards too when admin shows them, and pictures at most SERIES_PAIRS with covers', () => {
    const ids = Array.from({ length: SERIES_PAIRS + 2 }, (_, i) => `m${i}`)
    const rows = ids.map((id, i) => live(id, 'pets', { rank: i === 0 ? 1 : undefined, covers: i !== 1 }))
    const { categories } = featuredSections(rows, undefined, [series('s', ids, true)])
    expect(categories[0]?.templates.map((card) => card.id)).toEqual(['series-s', 'm0'])
    expect(categories[0]?.templates[0]?.series?.members).toEqual(['m0', 'm2', 'm3', 'm4', 'm5'])
    expect(categories[0]?.templates[0]?.series?.count).toBe(SERIES_PAIRS + 2)
  })

  it('leaves templates alone without series, and filters a landing page by its members\' category', () => {
    const rows = [live('m1', 'pets', { rank: 1 }), live('dish', 'food-drink', { rank: 2 })]
    expect(featuredSections(rows).categories.flatMap((c) => c.templates.map((t) => t.id))).toEqual(['dish', 'm1'])
    expect(featuredSections(rows, ['food-drink'], [series('s', ['m1'])]).categories.flatMap((c) => c.templates.map((t) => t.id))).toEqual(['dish'])
  })

  it('offers a series on the 404 once, opening the series, pictured by its first member with covers', () => {
    const rows = [live('m1', 'pets', { rank: 1, covers: false }), live('m2', 'pets', { rank: 2 })]
    expect(tryTemplates(rows, [series('s', ['m1', 'm2'])])).toEqual([
      { id: 'series-s', name: 'Series s', use: 'All of s', href: seriesHref('s-set'), before: 'https://shotviva.com/assets/covers/m2/b.webp', after: 'https://shotviva.com/assets/covers/m2/a.webp' },
    ])
  })
})
