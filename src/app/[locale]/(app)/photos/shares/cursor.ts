import type { OwnShare } from '@/core/work-share'

// The Share links page's ?before= cursor: the last row's created_at as the database wrote it and
// its id. Anything malformed is the first page.
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))_([0-9a-f]{32})$/

export function parseBefore(raw: string | string[] | undefined): { at: string; id: string } | undefined {
  const match = typeof raw === 'string' ? CURSOR.exec(raw) : null
  return match ? { at: match[1]!, id: match[2]! } : undefined
}

export const beforeParam = (share: Pick<OwnShare, 'cursor' | 'id'>) => encodeURIComponent(`${share.cursor}_${share.id}`)
