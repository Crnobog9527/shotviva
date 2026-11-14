import { describe, expect, it } from 'vitest'

import { overviewEnd } from './load'

describe('overview end time', () => {
  it('rounds down to 5 minutes, one value for both the database and PostHog reads', () => {
    expect(new Date(overviewEnd(Date.parse('2026-11-11T08:07:39Z'))).toISOString()).toBe('2026-11-11T08:05:00.000Z')
    expect(overviewEnd(Date.parse('2026-11-11T08:05:00Z'))).toBe(Date.parse('2026-11-11T08:05:00Z'))
  })
})
