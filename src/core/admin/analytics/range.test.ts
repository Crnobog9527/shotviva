import { describe, expect, it } from 'vitest'

import { parseRange, windowFor } from './range'
import { NOW } from './test-samples'

describe('time ranges (ARCHITECTURE §16.2a)', () => {
  it('defaults to 7 days and only takes the three ranges', () => {
    expect(parseRange(undefined)).toBe('7d')
    expect(parseRange('30d')).toBe('30d')
    expect(parseRange(['today'])).toBe('7d')
    expect(parseRange('90d')).toBe('7d')
  })

  it('takes today from Beijing midnight and compares it with yesterday up to the same time', () => {
    expect(windowFor('today', NOW)).toEqual({
      range: 'today',
      start: '2026-11-06T16:00:00.000Z',
      end: '2026-11-07T08:30:00.000Z',
      prevStart: '2026-11-05T16:00:00.000Z',
      prevEnd: '2026-11-06T08:30:00.000Z',
    })
  })

  it('counts 7 and 30 days as Beijing days, today included, like the overview', () => {
    // NOW is 16:30 on 7 November in Beijing: 7 days are 1–7 November up to now.
    expect(windowFor('7d', NOW)).toMatchObject({
      start: '2026-10-31T16:00:00.000Z',
      end: '2026-11-07T08:30:00.000Z',
      prevStart: '2026-10-24T16:00:00.000Z',
      prevEnd: '2026-10-31T08:30:00.000Z',
    })
    const month = windowFor('30d', NOW)
    expect(month.start).toBe('2026-10-08T16:00:00.000Z')
    expect(Date.parse(month.start) - Date.parse(month.prevStart)).toBe(30 * 86_400_000)
    expect(Date.parse(month.end) - Date.parse(month.prevEnd)).toBe(30 * 86_400_000)
  })

  it('takes a Beijing day that is still yesterday in UTC', () => {
    expect(windowFor('today', new Date('2026-11-07T17:00:00Z')).start).toBe('2026-11-07T16:00:00.000Z')
  })
})
