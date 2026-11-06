import { describe, expect, it } from 'vitest'

import { TEMPLATE_CATEGORIES } from '@/core/templates/categories'

import { FALLBACK_COUNT, featuredSections, featuredTemplates, tryTemplates } from './home-templates'
import { CATEGORY } from './landing-shared'
import { templateCategories } from './template-categories'
import { zhTemplateCategories } from './zh/template-categories'

let day = 0
const live = (id: string, category: string, extra: { rank?: number; covers?: boolean; description?: string } = {}) => ({
  id,
  name: `Name ${id}`,
  description: extra.description ?? `Use of ${id}`,
  category,
  coverBeforeUrl: extra.covers === false ? null : `https://shotviva.com/assets/covers/${id}/b.webp`,
  coverAfterUrl: extra.covers === false ? null : `https://shotviva.com/assets/covers/${id}/a.webp`,
  featuredRank: extra.rank ?? null,
  createdAt: `2026-11-${String(++day).padStart(2, '0')}T00:00:00Z`,
})

// T53, ARCHITECTURE §12 home item 3.
describe('featured templates from the database', () => {
  it('uses the admin\'s featured list in rank order', () => {
    const rows = [live('a', 'Pets', { rank: 2 }), live('b', 'Pets'), live('c', 'Food & Drink', { rank: 1 })]
    expect(featuredTemplates(rows).map((t) => t.id)).toEqual(['c', 'a'])
  })

  it('falls back to the six most recently published when nothing is featured', () => {
    const rows = Array.from({ length: 8 }, (_, i) => live(`t${i}`, 'Pets'))
    expect(featuredTemplates(rows).map((t) => t.id)).toEqual(['t7', 't6', 't5', 't4', 't3', 't2'].slice(0, FALLBACK_COUNT))
  })

  it('groups under the §5 categories in §5 order, hides empty ones, keeps unknown ones after', () => {
    const rows = [live('pet', 'Pets', { rank: 1 }), live('art', 'Art Styles', { rank: 2 }), live('odd', 'products', { rank: 3 }), live('dish', 'Food & Drink', { rank: 4 })]
    const { categories, media, defaultId } = featuredSections(templateCategories, rows)
    expect(categories.map((c) => c.name)).toEqual(['Art Styles', 'Food & Drink', 'Pets', 'products'])
    expect(categories[0]?.drag).toBe(true)
    expect(categories[0]?.templates).toEqual([{ id: 'art', name: 'Name art', use: 'Use of art' }])
    expect(media.pet).toEqual({ before: 'https://shotviva.com/assets/covers/pet/b.webp', after: 'https://shotviva.com/assets/covers/pet/a.webp', live: true })
    expect(defaultId).toBe('pet')
  })

  it('keeps a landing page to its own categories and opens its generator on the first of them', () => {
    const rows = [live('pet', 'Pets', { rank: 1 }), live('dish', 'Food & Drink', { rank: 2 }), live('dish2', 'Food & Drink', { rank: 3 })]
    const { categories, defaultId } = featuredSections(templateCategories, rows, ['Food & Drink'])
    expect(categories.map((c) => c.templates.map((t) => t.id))).toEqual([['dish', 'dish2']])
    expect(defaultId).toBe('dish')
  })

  it('offers the 404 only templates with both covers, never Art Styles', () => {
    const rows = [live('art', 'Art Styles', { rank: 1 }), live('bare', 'Pets', { rank: 2, covers: false }), live('pet', 'Pets', { rank: 3 })]
    expect(tryTemplates(templateCategories, rows).map((t) => t.id)).toEqual(['pet'])
  })

  it('names only §5 categories on the landing pages, with the same keys in both languages', () => {
    const keys = templateCategories.map((c) => c.key)
    for (const key of Object.values(CATEGORY)) expect(keys).toContain(key)
    expect(zhTemplateCategories.map((c) => c.key)).toEqual(keys)
    // The same six the admin picks from (core/templates/categories), in §5 page order.
    expect([...keys].sort()).toEqual([...TEMPLATE_CATEGORIES].sort())
  })
})
