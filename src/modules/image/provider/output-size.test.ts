import { describe, expect, it } from 'vitest'

import { outputSizeFor } from './output-size'

describe('outputSizeFor', () => {
  it.each([
    ['1:1', '1024x1024'],
    ['4:5', '1232x1536'],
    ['3:4', '1152x1536'],
    ['9:16', '864x1536'],
    ['16:9', '1536x864'],
  ])('%s → %s (edges multiples of 16)', (ratio, size) => {
    expect(outputSizeFor(ratio)).toBe(size)
    for (const edge of size.split('x').map(Number)) expect(edge % 16).toBe(0)
  })

  it('rejects malformed or over-3:1 ratios', () => {
    expect(() => outputSizeFor('wide')).toThrow()
    expect(() => outputSizeFor('4:1')).toThrow()
  })
})
