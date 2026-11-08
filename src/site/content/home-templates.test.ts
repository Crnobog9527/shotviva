import { describe, expect, it } from 'vitest'

import { FALLBACK_COUNT, featuredSections, featuredTemplates, tryTemplates } from './home-templates'

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
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
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
