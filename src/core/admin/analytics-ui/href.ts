import { DEFAULT_RANGE, type Range } from '../analytics/range'
import type { FunnelDim } from '../analytics/funnel'
import type { PageSort } from '../analytics/pages'

// The page's state lives in the URL (range, funnel dimension, page sort); defaults are left out.
export type AnalyticsQuery = { range: Range; dim: FunnelDim; sort: PageSort }

export function analyticsHref(query: AnalyticsQuery, patch: Partial<AnalyticsQuery> = {}, hash = ''): string {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.range !== DEFAULT_RANGE) params.set('range', next.range)
  if (next.dim !== 'none') params.set('dim', next.dim)
  if (next.sort !== 'views') params.set('sort', next.sort)
  const search = params.toString()
  return `/admin/analytics${search ? `?${search}` : ''}${hash}`
}
