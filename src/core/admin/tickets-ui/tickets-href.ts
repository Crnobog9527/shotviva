import type { AdminListFilter } from '@/core/support'

export function ticketsHref(filter: AdminListFilter, cursor?: string): string {
  const params = new URLSearchParams()
  if (filter.status !== 'open') params.set('status', filter.status)
  if (filter.type) params.set('type', filter.type)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return query ? `/admin/tickets?${query}` : '/admin/tickets'
}
