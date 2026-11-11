import { SyncError } from './covers'

// The reasons a sync step's RPC gives that the workflow log may show; anything else (PostgREST
// detail, source data) becomes the step's generic code.
const KNOWN = new Set([
  'INVALID_SYNC', 'CATEGORY_MISSING', 'CATEGORY_KIND_MISMATCH', 'CATEGORY_NAME_TAKEN', 'CATEGORY_PARENT_MISSING',
  'SERIES_CATEGORY_MISSING', 'INVALID_SERIES_CATEGORY', 'SERIES_MISSING', 'INVALID_SERIES_MEMBERS', 'INVALID_PARENT',
])

export function rpcError(error: { message: string; code?: string }, fallback: string): SyncError {
  if (KNOWN.has(error.message)) return new SyncError(error.message)
  // A unique index, e.g. a sibling slug or a series slug that production already uses differently.
  if (error.code === '23505') return new SyncError(`${fallback}_CONFLICT`)
  return new SyncError(`${fallback}_FAILED`)
}
