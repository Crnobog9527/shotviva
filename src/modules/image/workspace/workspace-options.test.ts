import { describe, expect, it } from 'vitest'

import { OUTPUT_ASPECTS, RESOLUTIONS } from '@/core/templates'

import { echoTranslate } from '../echo-translate'
import { notePlaceholder, SIZE_OPTIONS, TIER_OPTIONS, sizeLabel, tierName } from './workspace-options'

describe('workspace options', () => {
  it('offers exactly the eight output sizes, Original first', () => {
    expect(SIZE_OPTIONS.map((size) => size.id).sort()).toEqual([...OUTPUT_ASPECTS].sort())
    expect(SIZE_OPTIONS[0]?.id).toBe('original')
  })

  it('draws each ratio glyph at its own proportion inside the tile box', () => {
    expect(SIZE_OPTIONS.find((size) => size.id === '16:9')?.glyph).toEqual({ w: 34, h: 19, dashed: false })
    expect(SIZE_OPTIONS.find((size) => size.id === '9:16')?.glyph.h).toBe(30)
  })

  it('keeps the three resolutions in order with their pixel edge', () => {
    expect(TIER_OPTIONS.map((tier) => [tier.id, tier.px])).toEqual(RESOLUTIONS.map((id, i) => [id, [1024, 2048, 2880][i]]))
  })

  it('reads names from the messages', () => {
    const t = echoTranslate()
    expect(tierName('3k', t)).toBe('tiers.3k.name')
    expect(sizeLabel('16:9', t)).toBe('sizes.withRatio {"name":"sizes.16:9","ratio":"16:9"}')
    expect(sizeLabel('original', t)).toBe('sizes.original')
  })

  it('matches the note example to the category, with a fallback', () => {
    expect(notePlaceholder('pets', echoTranslate(['pets']))).toBe('pets')
    expect(notePlaceholder('something-new', echoTranslate(['pets']))).toBe('fallback')
  })
})
