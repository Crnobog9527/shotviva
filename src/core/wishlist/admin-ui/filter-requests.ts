import type { AdminRequest, RequestStatus } from '../types'

export type RequestSort = 'votes' | 'newest'

export type RequestFilter = { status: RequestStatus; sort: RequestSort; query: string }

// Pending is worked through by time; the other tabs default to votes (ARCHITECTURE §10).
export function defaultSort(status: RequestStatus): RequestSort {
  return status === 'pending' ? 'newest' : 'votes'
}

function matches(request: AdminRequest, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return request.description.toLowerCase().includes(needle) || (request.email ?? '').toLowerCase().includes(needle)
}

const byNewest = (a: AdminRequest, b: AdminRequest) => b.createdAt.localeCompare(a.createdAt)

// One tab, searched by description or email, sorted by votes (ties: newest) or by time.
export function filterRequests(requests: readonly AdminRequest[], filter: RequestFilter): AdminRequest[] {
  const query = filter.query.trim()
  const rows = requests.filter((request) => request.status === filter.status && matches(request, query))
  return rows.sort(filter.sort === 'votes' ? (a, b) => b.votesCount - a.votesCount || byNewest(a, b) : byNewest)
}

export function countByStatus(requests: readonly AdminRequest[]): Record<RequestStatus, number> {
  const counts: Record<RequestStatus, number> = { pending: 0, live: 0, shipped: 0, rejected: 0 }
  for (const request of requests) counts[request.status] += 1
  return counts
}
