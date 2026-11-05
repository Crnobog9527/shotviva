import { describe, expect, it } from 'vitest'

import { nearestRatio } from './photo-ratio'

describe('nearestRatio', () => {
  it('rounds a phone photo to the nearest everyday ratio', () => {
    expect(nearestRatio(3024, 4032)).toBe('3:4')
    expect(nearestRatio(1600, 2000)).toBe('4:5')
    expect(nearestRatio(4032, 2268)).toBe('16:9')
    expect(nearestRatio(1000, 1010)).toBe('1:1')
  })

  it('gives nothing for an empty size', () => {
    expect(nearestRatio(0, 10)).toBeNull()
  })
})
