import { describe, expect, it } from 'vitest'

import { hasListFilters, pageItems, parseUserFilters, usersHref } from './list-filters'

describe('users list filters (T77)', () => {
  it('keeps valid filters and drops junk instead of failing', () => {
    expect(parseUserFilters({ q: ' alice ', tier: 'max', provider: 'google', status: 'banned', from: '2026-11-01', to: '2026-11-08', sort: 'last_job', page: '3' })).toEqual({
      q: 'alice',
      tier: 'max',
      provider: 'google',
      status: 'banned',
      from: '2026-11-01',
      to: '2026-11-08',
      sort: 'last_job',
      page: 3,
    })
    expect(parseUserFilters({ tier: 'gold', provider: 'github', status: 'x', from: '11/01', sort: 'name', page: '-1', q: '   ' })).toEqual({})
    expect(parseUserFilters({ tier: ['pro', 'max'], page: 'abc', user: 'ignored' })).toEqual({ tier: 'pro' })
  })

  it('leaves the defaults out, so the plain list has one address', () => {
    expect(parseUserFilters({ sort: 'created', page: '1' })).toEqual({})
    expect(usersHref({})).toBe('/admin/users')
  })

  it('builds page links that keep the filters', () => {
    expect(usersHref({ tier: 'max', q: 'a@b' }, { page: 2 })).toBe('/admin/users?q=a%40b&tier=max&page=2')
    expect(usersHref({ tier: 'max', page: 4 }, { page: 1 })).toBe('/admin/users?tier=max')
    expect(usersHref({ sort: 'paid_credits' })).toBe('/admin/users?sort=paid_credits')
  })

  it('tells a filtered list from the plain one (sort and page do not count)', () => {
    expect(hasListFilters({ sort: 'last_job', page: 2 })).toBe(false)
    expect(hasListFilters({ status: 'banned' })).toBe(true)
  })

  it('numbers pages around the current one, first and last always shown', () => {
    expect(pageItems(1, 1)).toEqual([])
    expect(pageItems(1, 3)).toEqual([1, 2, 3])
    expect(pageItems(1, 13)).toEqual([1, 2, 3, 'gap', 13])
    expect(pageItems(7, 13)).toEqual([1, 'gap', 5, 6, 7, 8, 9, 'gap', 13])
    // A single hidden page is shown rather than replaced by a gap.
    expect(pageItems(5, 13)).toEqual([1, 2, 3, 4, 5, 6, 7, 'gap', 13])
    expect(pageItems(13, 13)).toEqual([1, 'gap', 11, 12, 13])
  })
})
