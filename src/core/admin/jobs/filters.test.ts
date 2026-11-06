import { describe, expect, it } from 'vitest'

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
})
