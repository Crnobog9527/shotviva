import { describe, expect, it } from 'vitest'

import { OUTPUT_ASPECTS, RESOLUTIONS } from '@/core/templates'

import { echoTranslate } from '../echo-translate'
import { notePlaceholder, SIZE_OPTIONS, TIER_OPTIONS, sizeLabel, tierName, tierPx, tierSize } from './workspace-options'

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
    expect(tierName('4k', t)).toBe('tiers.4k.name')
    expect(sizeLabel('16:9', t)).toBe('sizes.withRatio {"name":"sizes.16:9","ratio":"16:9"}')
    expect(sizeLabel('original', t)).toBe('sizes.original')
  })

  it('matches the note example to the category, with a fallback', () => {
    expect(notePlaceholder('pets', echoTranslate(['pets']))).toBe('pets')
    expect(notePlaceholder('something-new', echoTranslate(['pets']))).toBe('fallback')
  })
})

describe('tier pixels (4K is the model\'s largest size per ratio)', () => {
  it('shows the real output size for the chosen ratio', () => {
    expect(tierSize('4k', '16:9')).toEqual({ width: 3840, height: 2160 })
    expect(tierSize('4k', '1:1')).toEqual({ width: 2880, height: 2880 })
    expect(tierSize('2k', '4:5')).toEqual({ width: 1824, height: 2288 })
    expect(tierSize('4k', 'original', 16 / 9)).toEqual({ width: 3840, height: 2160 })
    expect(tierSize('4k', 'original')).toBeNull()
  })

  it('gives the long edge for a fixed ratio and nothing when the photo set the ratio', () => {
    expect(tierPx('4k', '9:16')).toBe(3840)
    expect(tierPx('4k', '1:1')).toBe(2880)
    expect(tierPx('4k', 'original')).toBe(0)
    expect(tierPx('4k')).toBe(0)
    expect(tierPx('1k', '21:5')).toBe(0)
  })
})
