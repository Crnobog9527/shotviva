import { z } from 'zod'

import { SIGNUP_PROVIDERS, USER_SORTS, USER_STATUSES, USER_TIERS } from './list-types'

// /admin/users filters, read from the URL so a filtered list can be bookmarked and the browser's
// back button works. Anything that does not parse is dropped rather than failing the page.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const filtersSchema = z.object({
  q: z.string().trim().min(1).max(200).optional().catch(undefined),
  tier: z.enum(USER_TIERS).optional().catch(undefined),
  provider: z.enum(SIGNUP_PROVIDERS).optional().catch(undefined),
  status: z.enum(USER_STATUSES).optional().catch(undefined),
  // Beijing calendar days, inclusive (as on /admin/jobs).
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  sort: z.enum(USER_SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
})

export type UserFilters = z.infer<typeof filtersSchema>

type SearchParams = Record<string, string | string[] | undefined>

export function parseUserFilters(params: SearchParams): UserFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || undefined]))
  const parsed = filtersSchema.parse(flat)
  // The defaults stay out of the URL, so the plain list has one address.
  if (parsed.sort === 'created') delete parsed.sort
  if (parsed.page === 1) delete parsed.page
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined)) as UserFilters
}

const ORDER = ['q', 'tier', 'provider', 'status', 'from', 'to', 'sort', 'page'] as const

// The list URL for these filters with some changed; changing a filter elsewhere should also
// pass page: undefined so the list starts again from page 1.
export function usersHref(filters: UserFilters, patch: Partial<UserFilters> = {}): string {
  const next: UserFilters = { ...filters, ...patch }
  const params = new URLSearchParams()
  for (const key of ORDER) {
    const value = next[key]
    if (value === undefined || (key === 'page' && value === 1) || (key === 'sort' && value === 'created')) continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `/admin/users?${query}` : '/admin/users'
}

export function hasListFilters(filters: UserFilters): boolean {
  return ORDER.some((key) => key !== 'page' && key !== 'sort' && filters[key] !== undefined)
}

export type PageItem = number | 'gap'

// Page links: the first, the last, and two either side of the current one; gaps in between.
export function pageItems(current: number, pageCount: number): PageItem[] {
  if (pageCount <= 1) return []
  const shown = new Set([1, pageCount])
  for (let page = current - 2; page <= current + 2; page += 1) if (page >= 1 && page <= pageCount) shown.add(page)
  const pages = [...shown].sort((a, b) => a - b)
  const items: PageItem[] = []
  pages.forEach((page, index) => {
    const previous = pages[index - 1]
    if (previous !== undefined && page - previous === 2) items.push(previous + 1)
    else if (previous !== undefined && page - previous > 2) items.push('gap')
    items.push(page)
  })
  return items
}
