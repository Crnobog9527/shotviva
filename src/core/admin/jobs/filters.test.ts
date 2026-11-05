import { describe, expect, it } from 'vitest'

import { estimateCosts } from './cost'
import { beijingDayStart, filtersHref, parseJobFilters } from './filters'

describe('job filters', () => {
  it('keeps valid filters and drops junk instead of failing', () => {
    expect(parseJobFilters({ status: 'failed', template: 'food-hero', source: 'graylum', from: '2026-11-01', model: 'gpt-image-2' })).toEqual({
      status: 'failed',
      template: 'food-hero',
      source: 'graylum',
      from: '2026-11-01',
      model: 'gpt-image-2',
    })
    expect(parseJobFilters({ status: 'nope', template: 'DROP TABLE', from: '11/01', model: '%' })).toEqual({})
    expect(parseJobFilters({ status: ['succeeded', 'failed'], to: '' })).toEqual({ status: 'succeeded' })
  })

  it('reads dates as Beijing days, the end day inclusive', () => {
    expect(beijingDayStart('2026-11-06')).toBe('2026-11-05T16:00:00.000Z')
    expect(beijingDayStart('2026-11-06', 1)).toBe('2026-11-06T16:00:00.000Z')
  })

  it('builds page links that keep the filters', () => {
    expect(filtersHref({ status: 'failed', cursor: 'old' }, 'next')).toBe('/admin/jobs?status=failed&cursor=next')
    expect(filtersHref({}, null)).toBe('/admin/jobs')
  })

  it('estimates cost from succeeded images only, unknown resolutions left out', () => {
    const { rows, total } = estimateCosts(
      [
        { model: 'gpt-image-2', resolution: '2k', jobs: 10, succeeded: 8 },
        { model: 'x', resolution: '8k', jobs: 1, succeeded: 1 },
      ],
      { '2k': 0.1 },
    )
    expect(rows[0]?.cost).toBeCloseTo(0.8)
    expect(rows[1]?.cost).toBeNull()
    expect(total).toBeCloseTo(0.8)
  })
})
