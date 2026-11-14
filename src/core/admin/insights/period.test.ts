import { describe, expect, it } from 'vitest'

import { bucketOf, bucketsOf, parsePeriod } from './period'

// 2026-11-14 10:00 in Beijing.
const NOW = Date.parse('2026-11-14T02:00:00Z')

describe('insights period', () => {
  it('defaults to the last 28 Beijing days up to now', () => {
    expect(parsePeriod(undefined, undefined, NOW)).toEqual({
      from: '2026-10-18', to: '2026-11-14', start: '2026-10-17T16:00:00.000Z', end: '2026-11-14T02:00:00.000Z', days: 28,
    })
  })

  it('ends a past range at its last Beijing midnight', () => {
    const p = parsePeriod('2026-11-01', '2026-11-07', NOW)
    expect([p.start, p.end, p.days]).toEqual(['2026-10-31T16:00:00.000Z', '2026-11-07T16:00:00.000Z', 7])
  })

  it('refuses future, reversed and malformed dates', () => {
    expect(parsePeriod('2026-11-01', '2026-12-01', NOW).to).toBe('2026-11-14')
    expect(parsePeriod('2026-11-10', '2026-11-01', NOW).from).toBe('2026-10-05')
    expect(parsePeriod('2026-02-30', 'x', NOW).from).toBe('2026-10-18')
  })

  it('cuts a range longer than 92 days, keeping its end', () => {
    const p = parsePeriod('2026-01-01', '2026-11-14', NOW)
    expect([p.from, p.days]).toEqual(['2026-08-15', 92])
  })

  it('buckets by Beijing day and by the Monday of the Beijing week', () => {
    // 2026-11-15 23:30 UTC is Monday 2026-11-16 07:30 in Beijing.
    expect(bucketOf('2026-11-15T23:30:00Z', 'day')).toBe('2026-11-16')
    expect(bucketOf('2026-11-15T23:30:00Z', 'week')).toBe('2026-11-16')
    expect(bucketOf('2026-11-15T15:00:00Z', 'week')).toBe('2026-11-09')
  })

  it('lists every bucket of the period once', () => {
    const p = parsePeriod('2026-11-08', '2026-11-14', NOW)
    expect(bucketsOf(p, 'day')).toHaveLength(7)
    expect(bucketsOf(p, 'week')).toEqual(['2026-11-02', '2026-11-09'])
  })
})
