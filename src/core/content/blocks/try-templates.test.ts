import { describe, expect, it } from 'vitest'

import { pickThree } from './try-templates'

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

describe('pickThree', () => {
  it('shows the first three on the server and during hydration', () => {
    expect(pickThree(ids, 0)).toEqual(['a', 'b', 'c'])
  })

  it('picks three different templates for any seed', () => {
    for (const seed of [0.01, 0.37, 0.5, 0.99]) {
      const picked = pickThree(ids, seed)
      expect(new Set(picked).size).toBe(3)
      for (const id of picked) expect(ids).toContain(id)
    }
  })

  it('varies with the seed', () => {
    const seen = new Set([0.11, 0.23, 0.42, 0.67, 0.89].map((seed) => pickThree(ids, seed).join()))
    expect(seen.size).toBeGreaterThan(1)
  })
})
