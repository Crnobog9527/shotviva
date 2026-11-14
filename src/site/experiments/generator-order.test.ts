import { describe, expect, it } from 'vitest'

import { generatorPickFor, orderForHero } from './generator-order'

const t = (id: string, category: string, categoryPath?: string[]) => ({ id, category, ...(categoryPath ? { categoryPath } : {}) })
const catalogue = [t('manhwa', 'art-styles'), t('tote-promo', 'posters'), t('white-background', 'products-resale'), t('wd-garden', 'food-drink'), t('wd-dappled-slate', 'food-drink'), t('apparel', 'products-resale', ['products-resale', 'apparel']), t('flat-anime-style', 'art-styles')]
const ids = (list: { id: string }[]) => list.map((template) => template.id)

describe('orderForHero', () => {
  it('puts the option template first, its categories next, the rest in today’s order', () => {
    const food = orderForHero(catalogue, generatorPickFor('food'))
    expect(food.first).toBe('wd-dappled-slate')
    expect(ids(food.ordered)).toEqual(['wd-dappled-slate', 'wd-garden', 'manhwa', 'tote-promo', 'white-background', 'apparel', 'flat-anime-style'])
    expect(ids(orderForHero(catalogue, generatorPickFor(undefined)).ordered).slice(0, 2)).toEqual(['white-background', 'apparel'])
    expect(ids(orderForHero(catalogue, generatorPickFor('art-style')).ordered).slice(0, 2)).toEqual(['flat-anime-style', 'manhwa'])
  })

  it('falls back when the first template is not on sale, and keeps everything when there is no pick', () => {
    const missing = orderForHero(catalogue.filter((template) => template.id !== 'wd-dappled-slate'), generatorPickFor('food'))
    expect(missing.first).toBe('wd-garden')
    expect(orderForHero(catalogue, undefined)).toEqual({ ordered: catalogue, first: null })
    expect(orderForHero(catalogue, generatorPickFor('food')).ordered).toHaveLength(catalogue.length)
  })
})
