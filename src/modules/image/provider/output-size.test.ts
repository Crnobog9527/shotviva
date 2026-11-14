import { describe, expect, it } from 'vitest'

import { OUTPUT_ASPECTS, RESOLUTIONS } from '@/core/templates'

import { formatSize, OUTPUT_SIZES, outputSize, sizeForRatio, TIER_EDGE, withinSquareTokens } from './output-size'
import { outputTokens } from './output-tokens'

const FIXED = OUTPUT_ASPECTS.filter((aspect) => aspect !== 'original')
const ratioOf = (aspect: string) => {
  const [w, h] = aspect.split(':').map(Number) as [number, number]
  return w / h
}

function expectLegal(size: { width: number; height: number }, edge: number) {
  expect(size.width % 16).toBe(0)
  expect(size.height % 16).toBe(0)
  expect(Math.max(size.width, size.height) / Math.min(size.width, size.height)).toBeLessThanOrEqual(3)
  expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(3840)
  expect(size.width * size.height).toBeLessThanOrEqual(edge * edge)
  expect(size.width * size.height).toBeGreaterThanOrEqual(655_360)
  expect(withinSquareTokens(size.width, size.height, edge)).toBe(true)
}

describe('output tokens (official calculator formula)', () => {
  it('reproduces the numbers OpenAI publishes for gpt-image-2.5', () => {
    expect(outputTokens('gpt-image-2.5', 1024, 1024, 'high')).toBe(1756)
    expect(outputTokens('gpt-image-2.5', 1536, 1024, 'high')).toBe(1372)
    expect(outputTokens('gpt-image-2.5', 1024, 1024, 'medium')).toBe(439)
    expect(outputTokens('gpt-image-2.5', 1024, 1024, 'low')).toBe(196)
  })
})

describe('output size table', () => {
  it.each(RESOLUTIONS)('%s: every size is legal and costs no more tokens than the square', (resolution) => {
    for (const aspect of [...FIXED, '3:4']) expectLegal(outputSize(resolution, aspect), TIER_EDGE[resolution])
  })

  it.each(RESOLUTIONS)('%s: the committed table matches the sizing rule and the asked ratio', (resolution) => {
    for (const [aspect, size] of Object.entries(OUTPUT_SIZES[resolution])) {
      expect(formatSize(sizeForRatio(resolution, ratioOf(aspect)))).toBe(size)
      const { width, height } = outputSize(resolution, aspect)
      expect(Math.abs(width / height - ratioOf(aspect)) / ratioOf(aspect)).toBeLessThan(0.01)
    }
  })

  it('squares are the tier edges', () => {
    expect(RESOLUTIONS.map((r) => formatSize(outputSize(r, '1:1')))).toEqual(['1024x1024', '2048x2048', '2880x2880'])
  })

  it("'original' follows the photo, is square without one, and clamps past 3:1", () => {
    expect(formatSize(outputSize('1k', 'original', { width: 4032, height: 3024 }))).toBe(OUTPUT_SIZES['1k']['4:3'])
    expect(formatSize(outputSize('2k', 'original'))).toBe('2048x2048')
    const panorama = outputSize('1k', 'original', { width: 8000, height: 1000 })
    expect(panorama.width / panorama.height).toBeLessThanOrEqual(3)
  })

  it('stays legal for any photo ratio between 1:3 and 3:1', () => {
    for (const resolution of RESOLUTIONS) {
      for (let i = 0; i <= 60; i += 1) {
        const ratio = Math.exp(Math.log(1 / 3) + (i * Math.log(9)) / 60)
        expectLegal(outputSize(resolution, 'original', { width: Math.round(ratio * 1000), height: 1000 }), TIER_EDGE[resolution])
      }
    }
  })

  it('rejects malformed or over-3:1 ratios', () => {
    expect(() => outputSize('1k', 'wide')).toThrow()
    expect(() => outputSize('1k', '4:1')).toThrow()
  })
})
