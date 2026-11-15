import { describe, expect, it } from 'vitest'

import { displayAreaText, featuredPrizes, toggleFeatured, unusedPhotoSlots, withFeaturedSpots } from './featured'
import { posterFieldsSchema } from './template'

const row = (n: number, featured?: number) => ({ rank: `R${n}`, rankEn: '', prize: `P${n}`, ...(featured ? { featured } : {}) })
const rows = Array.from({ length: 12 }, (_, i) => row(i + 1))
const four = { count: 4, photos: ['prize_a', 'prize_b', 'prize_c', 'prize_d'] }

describe('featuredPrizes (§5.3 展示位)', () => {
  it('reads the top rows until the user picks', () => {
    expect(featuredPrizes(rows, four).map((item) => [item.row, item.spot])).toEqual([[0, 1], [1, 2], [2, 3], [3, 4]])
    expect(featuredPrizes(rows.slice(0, 2), four)).toHaveLength(2)
    expect(featuredPrizes(rows, undefined)).toEqual([])
  })

  it('keeps the picked rows in list order, ignoring spots past the count or taken twice', () => {
    const picked = [row(1), row(2, 3), row(3), row(4, 1), row(5, 9), row(6, 3)]
    expect(featuredPrizes(picked, four).map((item) => [item.row, item.spot])).toEqual([[1, 3], [3, 1]])
  })
})

describe('toggleFeatured', () => {
  it('writes the defaults in, then gives a new prize the lowest free spot', () => {
    const off = toggleFeatured(rows, 1, false, four)
    expect(off.freed).toBe(2)
    const on = toggleFeatured(off.rows, 7, true, four)
    expect(on.taken).toBe(2)
    expect(featuredPrizes(on.rows, four).map((item) => [item.row, item.spot])).toEqual([[0, 1], [2, 3], [3, 4], [7, 2]])
  })

  it('never goes past the count nor below one', () => {
    expect(toggleFeatured(rows, 8, true, four).taken).toBeUndefined()
    const one = withFeaturedSpots([row(1), row(2)], { count: 1 })
    expect(toggleFeatured(one, 0, false, { count: 1 }).freed).toBeUndefined()
  })

  it('keeps a prize its spot when a row above is removed', () => {
    const spotted = withFeaturedSpots(rows, four).slice(1)
    expect(featuredPrizes(spotted, four).map((item) => item.prize)).toEqual(['P2', 'P3', 'P4'])
  })
})

describe('unusedPhotoSlots', () => {
  it('lists the photo slots no featured prize holds', () => {
    const picked = [row(1, 2), row(2), row(3, 4)]
    expect(unusedPhotoSlots(four, picked)).toEqual(['prize_a', 'prize_c'])
    expect(unusedPhotoSlots(undefined, picked)).toEqual([])
  })
})

describe('displayAreaText', () => {
  it('maps each featured prize to its image, or to the product named', () => {
    const items = featuredPrizes([row(1, 1), row(2, 2), row(3)], four)
    const text = displayAreaText(items, (spot) => (spot === 1 ? 2 : null))
    expect(text).toContain('Featured 1: R1 | P1 - draw exactly the product in Image 2')
    expect(text).toContain('Featured 2: R2 | P2 - no photo: draw the real product named')
    expect(text).not.toContain('P3')
    expect(displayAreaText([], () => null)).toBe('')
  })
})

describe('poster.featured in the template', () => {
  const name = { en: 'x', zh: 'x' }
  const kinds = [{ key: 'prizes', name, blocks: ['header', 'prizes'], slots: ['logo', ...four.photos] }, { key: 'rules', name, blocks: ['sections'] }]

  it('takes one photo slot per spot, listed by the prize page', () => {
    expect(posterFieldsSchema.safeParse({ kinds, featured: four }).success).toBe(true)
    expect(posterFieldsSchema.safeParse({ kinds, featured: { count: 4 } }).success).toBe(true)
    expect(posterFieldsSchema.safeParse({ kinds, featured: { count: 3, photos: four.photos } }).success).toBe(false)
    expect(posterFieldsSchema.safeParse({ kinds, featured: { count: 1, photos: ['other'] } }).success).toBe(false)
  })
})
