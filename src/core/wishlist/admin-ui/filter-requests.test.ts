import { describe, expect, it } from 'vitest'

import type { AdminRequest } from '../types'
import { countByStatus, defaultSort, filterRequests } from './filter-requests'

const request = (id: string, overrides: Partial<AdminRequest>): AdminRequest => ({
  id,
  email: 'owner@example.test',
  description: `request ${id}`,
  status: 'live',
  templateId: null,
  votesCount: 0,
  imageUrls: [],
  createdAt: '2026-11-01T00:00:00Z',
  ...overrides,
})

const rows = [
  request('a', { votesCount: 1, createdAt: '2026-11-03T00:00:00Z' }),
  request('b', { votesCount: 5, createdAt: '2026-11-01T00:00:00Z' }),
  request('c', { votesCount: 1, createdAt: '2026-11-04T00:00:00Z', description: 'Brunch menu poster' }),
  request('d', { status: 'pending', email: 'cafe@example.test' }),
]

describe('filterRequests', () => {
  it('sorts a tab by votes, newest first on ties', () => {
    expect(filterRequests(rows, { status: 'live', sort: 'votes', query: '' }).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by time when asked', () => {
    expect(filterRequests(rows, { status: 'live', sort: 'newest', query: '' }).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('searches description and email, case-insensitively', () => {
    expect(filterRequests(rows, { status: 'live', sort: 'votes', query: 'BRUNCH' }).map((r) => r.id)).toEqual(['c'])
    expect(filterRequests(rows, { status: 'pending', sort: 'votes', query: 'cafe@' }).map((r) => r.id)).toEqual(['d'])
  })

  it('counts each status and defaults pending to time order', () => {
    expect(countByStatus(rows)).toEqual({ pending: 1, live: 3, shipped: 0, rejected: 0 })
    expect(defaultSort('pending')).toBe('newest')
    expect(defaultSort('live')).toBe('votes')
  })
})
