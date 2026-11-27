import { z } from 'zod'

import { normalizeJobRef } from '@/core/jobs/ref'

// The 企业作品 filters on /admin/orgs/[id], read from the URL so a filtered view can be linked
// from a member row or pasted into a ticket. Anything that does not parse is dropped rather than
// failing the page. Client-safe: the filter form reads the same shape.

export const ORG_WORK_STATUSES = ['succeeded', 'failed', 'running'] as const
export type OrgWorkStatus = (typeof ORG_WORK_STATUSES)[number]

const filtersSchema = z.object({
  member: z.uuid().optional().catch(undefined),
  status: z.enum(ORG_WORK_STATUSES).optional().catch(undefined),
  // A work id, its reference number or any 6+ character prefix of it (normalizeJobRef).
  work: z.string().trim().max(40).optional().catch(undefined),
  cursor: z.string().max(400).optional().catch(undefined),
})

export type OrgWorkFilters = z.infer<typeof filtersSchema>

type SearchParams = Record<string, string | string[] | undefined>

export function parseOrgWorkFilters(params: SearchParams): OrgWorkFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || undefined]))
  return filtersSchema.parse(flat)
}

// The typed work id as a uuid prefix; `invalid` when something was typed that cannot be one (the
// list is then empty and the filter bar says why).
export function workFilter(filters: Pick<OrgWorkFilters, 'work'>): { ref: string | null; invalid: boolean } {
  if (!filters.work) return { ref: null, invalid: false }
  const ref = normalizeJobRef(filters.work)
  return { ref, invalid: ref === null }
}

// The section's own address: the org page's 企业作品 tab with these filters (and a cursor, for
// the next page), scrolled to the works section.
export function orgWorksHref(orgId: string, filters: Omit<OrgWorkFilters, 'cursor'>, cursor: string | null = null): string {
  const params = new URLSearchParams({ tab: 'works' })
  for (const key of ['member', 'status', 'work'] as const) if (filters[key]) params.set(key, filters[key])
  if (cursor) params.set('cursor', cursor)
  return `/admin/orgs/${orgId}?${params.toString()}#works`
}
