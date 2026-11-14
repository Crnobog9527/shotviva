import { describe, expect, it } from 'vitest'

import { beijingDayStart, filtersHref, parseJobFilters, refFilter } from './filters'

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

describe('refFilter (T78)', () => {
  it('reads a reference number or prefix from the URL, with or without dashes', () => {
    expect(refFilter(parseJobFilters({ ref: ' 2FA821C6 ' }))).toEqual({ ref: '2fa821c6', invalid: false })
    expect(refFilter(parseJobFilters({ ref: '2fa821c61a' }))).toEqual({ ref: '2fa821c6-1a', invalid: false })
  })

  it('is no filter when empty, and invalid when it cannot be a prefix', () => {
    expect(refFilter(parseJobFilters({}))).toEqual({ ref: null, invalid: false })
    expect(refFilter(parseJobFilters({ ref: '2fa82' }))).toEqual({ ref: null, invalid: true })
    expect(refFilter(parseJobFilters({ ref: 'someone@x' }))).toEqual({ ref: null, invalid: true })
  })

  it('keeps the reference in the next-page link', () => {
    expect(filtersHref(parseJobFilters({ ref: '2fa821', status: 'failed' }), 'c1')).toBe('/admin/jobs?ref=2fa821&status=failed&cursor=c1')
  })
})
