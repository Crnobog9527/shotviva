import { describe, expect, it } from 'vitest'

import { batchableTemplates, cardPrice, categoriesOf, hasStills, isCompareCategory, isMotion, posterHref, toCatalogueTemplate, type CatalogueTemplate } from './catalogue-template'
import { isCompareSample } from './template-sample'

// Category order and card style as set in 分类管理 (T75); 'art-styles' is the compare one.
const ORDER: Record<string, number> = { 'art-styles': 10, 'products-resale': 30, pets: 60 }
const tpl = (id: string, category: string, cover: Partial<CatalogueTemplate['cover']> = {}): CatalogueTemplate => ({
  id,
  name: id,
  category,
  categoryName: `Name of ${category}`,
  categoryOrder: ORDER[category] ?? 100,
  compare: category === 'art-styles',
  description: null,
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 },
  copyFields: [],
  toggles: [],
  cover: { type: 'image', before: null, after: null, motion: null, poster: null, ...cover },
})

describe('catalogue helpers', () => {
  it('lists categories once, in the admin\'s category order, with their names', () => {
    expect(categoriesOf([tpl('b', 'pets'), tpl('a', 'art-styles'), tpl('c', 'pets')])).toEqual([
      { key: 'art-styles', name: 'Name of art-styles' },
      { key: 'pets', name: 'Name of pets' },
    ])
  })

  it('prices the card at the Standard tier', () => {
    expect(cardPrice(tpl('a', 'x'))).toBe(2)
    expect(cardPrice({ ...tpl('a', 'x'), creditsCost: { '1k': 1, '2k': 2, '4k': 3 } })).toBe(1)
  })

  it('treats a card as motion only with its file and poster', () => {
    expect(isMotion(tpl('v', 'x', { type: 'video', motion: 'https://a/v.mp4', poster: 'https://a/p.webp' }))).toBe(true)
    expect(isMotion(tpl('v', 'x', { type: 'video', motion: null, poster: 'https://a/p.webp' }))).toBe(false)
    expect(isMotion(tpl('i', 'x'))).toBe(false)
  })

  // DESIGN §6.9 item 1: a category whose card style is 'compare' (画风) keeps the drag compare;
  // everything else is the pair. T75: decided by card_style, never by the category's name.
  it('gives the drag compare to a compare category with both stills, the pair to the rest', () => {
    const stills = { before: 'https://a/b.webp', after: 'https://a/a.webp' }
    expect(isCompareSample(tpl('manhwa', 'art-styles', stills))).toBe(true)
    expect(isCompareSample(tpl('manhwa', 'art-styles', { before: 'https://a/b.webp' }))).toBe(false)
    expect(isCompareSample(tpl('white', 'products-resale', stills))).toBe(false)
    expect(isCompareCategory(tpl('x', 'art-styles'))).toBe(true)
    // Renamed, the same category keeps it; a pair category named "Art Styles" does not get it.
    expect(isCompareSample({ ...tpl('manhwa', 'art-styles', stills), name: '漫画风' })).toBe(true)
    expect(isCompareSample({ ...tpl('x', 'pets', stills), name: 'Art Styles' })).toBe(false)
    expect(hasStills(tpl('x', 'pets', stills))).toBe(true)
    expect(hasStills(tpl('x', 'pets', { after: 'https://a/a.webp' }))).toBe(false)
  })
})

describe('poster templates in the catalogue', () => {
  const poster = { ...tpl('tournament-poster-emerald', 'posters'), photoInput: 'none' as const, poster: true }

  it('sends a poster card to its editor and every other card to the dialog', () => {
    expect(posterHref(poster)).toBe('/generate?poster=tournament-poster-emerald')
    expect(posterHref(tpl('ramen', 'food'))).toBeNull()
  })

  it('never offers a poster template, a slot template or a no-photo template for batch create', () => {
    const photo = { ...tpl('ramen', 'food'), photoInput: 'required' as const }
    const slots = { ...photo, id: 'duo', imageSlots: [{ key: 'a', label: 'A', required: true }] }
    const posterWithPhoto = { ...poster, photoInput: 'optional' as const }
    expect(batchableTemplates([photo, slots, poster, posterWithPhoto]).map((t) => t.id)).toEqual(['ramen'])
  })

  it('marks a template with fields.poster, and only that one', () => {
    const base = {
      id: 'p', name: 'P', category: 'posters', categoryView: { name: '海报', sortOrder: 90, compare: false },
      categoryInfo: { galleryExcluded: true }, description: null, creditsCost: { '1k': 1, '2k': 2, '4k': 3 },
      coverMediaType: 'image', coverBeforeUrl: null, coverAfterUrl: null, coverVideoUrl: null, coverPosterUrl: null,
    }
    const fields = { images: { min: 0, max: 0 }, copy: [], aspectRatios: ['1:2'] }
    expect(toCatalogueTemplate({ ...base, fields: { ...fields, poster: { kinds: [] } } } as never)).toMatchObject({ poster: true, photoInput: 'none', privateOnly: true })
    expect(toCatalogueTemplate({ ...base, fields } as never)).not.toHaveProperty('poster')
  })
})
