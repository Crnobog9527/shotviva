import { z } from 'zod'

import { normalizeJobRef } from '@/core/jobs/ref'

// /admin/jobs filters, read from the URL so a filtered view can be bookmarked or shared.
// Anything that does not parse is dropped rather than failing the page.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const filtersSchema = z.object({
  // A reference number or any 6+ character prefix of the job id (T78); read by normalizeJobRef.
  ref: z.string().trim().max(40).optional().catch(undefined),
  status: z.enum(['running', 'succeeded', 'failed']).optional().catch(undefined),
  template: z.string().regex(/^[a-z0-9-]{1,64}$/).optional().catch(undefined),
  // Matches the model half of generation_jobs.provider ('<source>/<model>').
  model: z.string().trim().min(1).max(120).regex(/^[\w.:/-]+$/).optional().catch(undefined),
  source: z.enum(['web', 'graylum']).optional().catch(undefined),
  // Beijing calendar days, inclusive (the admin's dates; DESIGN §7).
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  cursor: z.string().max(400).optional().catch(undefined),
})

export type JobFilters = z.infer<typeof filtersSchema>

type SearchParams = Record<string, string | string[] | undefined>

export function parseJobFilters(params: SearchParams): JobFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || undefined]))
  return filtersSchema.parse(flat)
}

// The reference-number filter (T78): the normalized prefix, or `invalid` when something was typed
// that cannot be one (the list is then empty and the filter bar says why).
export function refFilter(filters: Pick<JobFilters, 'ref'>): { ref: string | null; invalid: boolean } {
  if (!filters.ref) return { ref: null, invalid: false }
  const ref = normalizeJobRef(filters.ref)
  return { ref, invalid: ref === null }
}

// Beijing midnight of a YYYY-MM-DD day as an ISO instant; `to` is exclusive (next midnight).
export function beijingDayStart(value: string, plusDays = 0): string {
  const ms = Date.parse(`${value}T00:00:00+08:00`) + plusDays * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString()
}

// The same filters without the cursor, plus a new one: the "next page" link.
export function filtersHref(filters: JobFilters, cursor: string | null): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (key !== 'cursor' && value) params.set(key, value)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return query ? `/admin/jobs?${query}` : '/admin/jobs'
}
