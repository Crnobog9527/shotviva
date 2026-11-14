import { SyncError } from './covers'

// The reasons a sync step's RPC gives that the workflow log may show; anything else (PostgREST
// detail, source data) becomes the step's generic code.
const KNOWN = new Set([
  'INVALID_SYNC', 'CATEGORY_MISSING', 'CATEGORY_KIND_MISMATCH', 'CATEGORY_NAME_TAKEN', 'CATEGORY_PARENT_MISSING',
  'SERIES_CATEGORY_MISSING', 'INVALID_SERIES_CATEGORY', 'SERIES_MISSING', 'INVALID_SERIES_MEMBERS', 'INVALID_PARENT',
  // 上下架 and 开放售卖 (1274): production's own checks, by the names its functions and triggers use.
  'NOT_ADMIN', 'TEMPLATE_MISSING', 'LIVE_TEMPLATE_INCOMPLETE', 'SALE_ROUTE_NOT_ALLOWED', 'TEMPLATE_RETIRED',
  'TEMPLATE_PRICE_BELOW_FLOOR', 'UNPUBLISH_FIRST', 'FORBIDDEN', 'MODEL_CREDIT_FLOOR',
  // A series deleted on production (1500): never brought back by a sync.
  'SERIES_DELETED',
])

export function rpcError(error: { message: string; code?: string }, fallback: string): SyncError {
  if (KNOWN.has(error.message)) return new SyncError(error.message)
  // A unique index, e.g. a sibling slug or a series slug that production already uses differently.
  if (error.code === '23505') return new SyncError(`${fallback}_CONFLICT`)
  return new SyncError(`${fallback}_FAILED`)
}
