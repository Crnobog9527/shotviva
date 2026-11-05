import { describe, expect, it } from 'vitest'

import { OUTPUT_ASPECTS, RESOLUTIONS } from '@/core/templates'

import { notePlaceholder, SIZE_OPTIONS, TIER_OPTIONS, sizeLabel, tierName } from './workspace-options'

describe('workspace options', () => {
  it('offers exactly the eight output sizes, Original first', () => {
    expect(SIZE_OPTIONS.map((size) => size.id).sort()).toEqual([...OUTPUT_ASPECTS].sort())
    expect(SIZE_OPTIONS[0]?.id).toBe('original')
  })

  it('draws each ratio glyph at its own proportion inside the tile box', () => {
    const banner = SIZE_OPTIONS.find((size) => size.id === '16:9')
    expect(banner?.glyph).toEqual({ w: 34, h: 19, dashed: false })
    const story = SIZE_OPTIONS.find((size) => size.id === '9:16')
    expect(story?.glyph.h).toBe(30)
  })

  it('names the resolutions Standard / HD / Max, never 1K / 2K / 3K', () => {
    expect(TIER_OPTIONS.map((tier) => tier.id)).toEqual([...RESOLUTIONS])
    expect(TIER_OPTIONS.map((tier) => tier.name)).toEqual(['Standard', 'HD', 'Max'])
    expect(tierName('3k')).toBe('Max')
  })

  it('labels sizes for meta lines', () => {
    expect(sizeLabel('16:9')).toBe('Banner 16:9')
    expect(sizeLabel('original')).toBe('Original')
  })
  it('matches the note example to the category, with a neutral fallback', () => {
    expect(notePlaceholder('Food & Drink')).toMatch(/mint/)
    expect(notePlaceholder('Something new')).toMatch(/brighten/)
  })
})
