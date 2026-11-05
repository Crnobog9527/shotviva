import { describe, expect, it } from 'vitest'

import { estimatedProgress, percent } from './progress'

describe('estimatedProgress', () => {
  it('starts at zero and climbs past half within the usual 20–40 seconds', () => {
    expect(estimatedProgress(0)).toBe(0)
    expect(estimatedProgress(20_000)).toBeGreaterThan(0.5)
    expect(estimatedProgress(40_000)).toBeLessThan(0.95)
  })

  it('never claims done before the job settles', () => {
    expect(estimatedProgress(10 * 60_000)).toBe(0.95)
    expect(percent(estimatedProgress(10 * 60_000))).toBe(95)
  })
})
