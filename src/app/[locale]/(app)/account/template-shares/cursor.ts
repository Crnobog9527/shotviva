import type { ShareCursor } from '@/core/template-shares'

// ?before=<created_at>~<id>: the last link of the page shown, so the next page starts after it.
// created_at is kept exactly as the database gave it (microseconds), so no link is skipped.
export const cursorParam = (share: { createdAt: string; id: string }) => encodeURIComponent(`${share.createdAt}~${share.id}`)

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))~([a-z0-9]{12})$/

export function cursorOf(value: string | string[] | undefined): ShareCursor | undefined {
  const match = typeof value === 'string' ? CURSOR.exec(value) : null
  return match ? { createdAt: match[1] as string, id: match[2] as string } : undefined
}
