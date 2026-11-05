import { describe, expect, it } from 'vitest'

import { assertKeyMatchesEnvironment } from './stripe/client'
import { concurrencyFor } from './tier'

describe('concurrencyFor (ARCHITECTURE §6.2)', () => {
  it.each([
    ['starter', 1],
    ['pro', 3],
    ['max', 6],
    [null, 1],
  ] as const)('%s runs %i at once', (tier, limit) => {
    expect(concurrencyFor(tier)).toBe(limit)
  })
})

describe('assertKeyMatchesEnvironment', () => {
  it('allows test keys anywhere and live keys only in production', () => {
    expect(() => assertKeyMatchesEnvironment('sk_test_x', 'preview')).not.toThrow()
    expect(() => assertKeyMatchesEnvironment('sk_test_x', undefined)).not.toThrow()
    expect(() => assertKeyMatchesEnvironment('sk_live_x', 'production')).not.toThrow()
    expect(() => assertKeyMatchesEnvironment('sk_live_x', 'preview')).toThrow(/live Stripe key/)
    expect(() => assertKeyMatchesEnvironment('rk_live_x', undefined)).toThrow(/live Stripe key/)
  })
})
