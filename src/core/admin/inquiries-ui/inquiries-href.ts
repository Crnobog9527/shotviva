import type { InquiryFilter } from '@/core/inquiries'

export function inquiriesHref(filter: InquiryFilter, cursor?: string): string {
  const params = new URLSearchParams()
  if (filter.status !== 'all') params.set('status', filter.status)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return query ? `/admin/inquiries?${query}` : '/admin/inquiries'
}
