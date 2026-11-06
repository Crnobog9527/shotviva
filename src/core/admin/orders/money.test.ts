import { describe, expect, it } from 'vitest'

import { formatMinor } from './money'

describe('formatMinor', () => {
  it('reads Stripe minor units per currency', () => {
    expect(formatMinor(2189, 'usd')).toBe('$21.89')
    expect(formatMinor(0, 'usd')).toBe('$0.00')
    expect(formatMinor(3000, 'jpy')).toBe('¥3,000')
  })
})
