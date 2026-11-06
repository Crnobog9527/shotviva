import { describe, expect, it } from 'vitest'

import { cardPrice, categoriesOf, isMotion, type CatalogueTemplate } from './catalogue-template'

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
})
