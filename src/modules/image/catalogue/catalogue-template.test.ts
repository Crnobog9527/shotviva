import { describe, expect, it } from 'vitest'

import { cardPrice, categoriesOf, hasStills, isArtStyle, isMotion, type CatalogueTemplate } from './catalogue-template'
import { isCompareSample } from './template-sample'

const tpl = (id: string, category: string, cover: Partial<CatalogueTemplate['cover']> = {}): CatalogueTemplate => ({
  id,
  name: id,
  category,
  description: null,
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  copyFields: [],
  cover: { type: 'image', before: null, after: null, motion: null, poster: null, ...cover },
})

describe('catalogue helpers', () => {
  it('lists categories once, in catalogue order', () => {
    expect(categoriesOf([tpl('a', 'Art Styles'), tpl('b', 'Pets'), tpl('c', 'Art Styles')])).toEqual(['Art Styles', 'Pets'])
  })

  it('prices the card at the Standard tier', () => {
    expect(cardPrice(tpl('a', 'x'))).toBe(2)
    expect(cardPrice({ ...tpl('a', 'x'), creditsCost: { '1k': 1, '2k': 2, '3k': 3 } })).toBe(1)
  })

  it('treats a card as motion only with its file and poster', () => {
    expect(isMotion(tpl('v', 'x', { type: 'video', motion: 'https://a/v.mp4', poster: 'https://a/p.webp' }))).toBe(true)
    expect(isMotion(tpl('v', 'x', { type: 'video', motion: null, poster: 'https://a/p.webp' }))).toBe(false)
    expect(isMotion(tpl('i', 'x'))).toBe(false)
  })

  // DESIGN §6.9 item 1: only Art Styles keeps the drag compare; everything else is the pair.
  it('gives the drag compare to Art Styles with both stills, the pair to the rest', () => {
    const stills = { before: 'https://a/b.webp', after: 'https://a/a.webp' }
    expect(isCompareSample(tpl('manhwa', 'Art Styles', stills))).toBe(true)
    expect(isCompareSample(tpl('manhwa', 'Art Styles', { before: 'https://a/b.webp' }))).toBe(false)
    expect(isCompareSample(tpl('white', 'Products & Resale', stills))).toBe(false)
    expect(isArtStyle(tpl('x', 'Art Styles'))).toBe(true)
    expect(hasStills(tpl('x', 'Pets', stills))).toBe(true)
    expect(hasStills(tpl('x', 'Pets', { after: 'https://a/a.webp' }))).toBe(false)
  })
})
