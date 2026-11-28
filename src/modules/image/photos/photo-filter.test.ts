import { describe, expect, it } from 'vitest'

import { ownJobsFilterFrom, type OwnPhotoCategory } from '@/core/jobs'

import { heldBy, offersFilter, photosHref } from './photo-filter'

const cat = (key: string, works: number, watermarked = 0, system = false): OwnPhotoCategory => ({ key, nameEn: key, nameZh: key, system, works, watermarked })

describe('Photos filter', () => {
  it('reads one filter from the address and nothing from anything else', () => {
    expect(ownJobsFilterFrom('food', undefined)).toEqual({ category: 'food' })
    expect(ownJobsFilterFrom(undefined, 'watermark')).toEqual({ watermarked: true })
    expect(ownJobsFilterFrom('food', 'watermark')).toEqual({ category: 'food' })
    for (const bad of ['', 'Food', 'a b', "x'--", 'a'.repeat(65), ['food'], 3]) expect(ownJobsFilterFrom(bad, undefined)).toBeNull()
    expect(ownJobsFilterFrom(undefined, 'clean')).toBeNull()
  })

  it('keeps the filter in Load more\'s address', () => {
    expect(photosHref(null)).toBe('/photos')
    expect(photosHref({ category: 'food' })).toBe('/photos?category=food')
    expect(photosHref({ watermarked: true }, 'abc')).toBe('/photos?mark=watermark&until=abc')
    expect(photosHref(null, 'abc')).toBe('/photos?until=abc')
  })

  it('offers a filter only when it can narrow the list', () => {
    expect(offersFilter([], null)).toBe(false)
    expect(offersFilter([cat('food', 5)], null)).toBe(false)
    expect(offersFilter([cat('food', 5), cat('system', 2, 0, true)], null)).toBe(false)
    expect(offersFilter([cat('food', 5), cat('pets', 1)], null)).toBe(true)
    expect(offersFilter([cat('food', 5, 2)], null)).toBe(true)
    // All watermarked: the chip would list everything.
    expect(offersFilter([cat('food', 5, 5)], null)).toBe(false)
    // A chosen filter always keeps the rail, so the way back to All is there.
    expect(offersFilter([], { category: 'food' })).toBe(true)
  })

  it('knows how many works a filter holds from the chips', () => {
    const chips = [cat('food', 5, 2), cat('pets', 1, 1)]
    expect(heldBy(chips, { category: 'food' })).toBe(5)
    expect(heldBy(chips, { watermarked: true })).toBe(3)
    expect(heldBy(chips, { category: 'gone' })).toBeNull()
  })
})
