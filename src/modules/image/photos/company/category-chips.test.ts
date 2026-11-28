import { describe, expect, it } from 'vitest'

import { decodeChips, encodeChips } from './category-chips'

describe('the company view\'s chips in Load more\'s address', () => {
  it('round-trips the total and each chip', () => {
    const text = encodeChips(12, [{ key: 'food', works: 9 }, { key: 'art-styles', works: 3 }])
    expect(text).toBe('12~food.9~art-styles.3')
    expect(decodeChips(text)).toEqual({ total: 12, chips: [{ key: 'food', works: 9 }, { key: 'art-styles', works: 3 }] })
    expect(decodeChips(encodeChips(0, []))).toEqual({ total: 0, chips: [] })
  })

  it('is nothing unless every part is a count or a key with a count', () => {
    for (const bad of [undefined, '', 'x', '-1', '1.5', '3~food', '3~food.x', '3~.2', '3~Food.2', "3~a'--.2", '3~food.999999999', ['3'], `1${'~a.1'.repeat(41)}`]) {
      expect(decodeChips(bad)).toBeNull()
    }
  })
})
