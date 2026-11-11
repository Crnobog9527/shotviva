import { EDIT_QUERY, opensEdit } from '../../edit-ui/edit-link'

// The Photos viewer's address (2026-11-12): every open work keeps a real URL, /photos/<id>
// (/zh/photos/<id> in Chinese), so a link, a refresh and Back behave as with a page. The path
// here is the locale-free one next-intl's usePathname returns.
const WORK_PATH = /^\/photos\/([0-9a-f-]{36})\/?$/i

export function workIdOf(pathname: string): string | null {
  return WORK_PATH.exec(pathname)?.[1]?.toLowerCase() ?? null
}

export const workPath = (id: string | null) => (id ? `/photos/${encodeURIComponent(id)}` : '/photos')

// ?edit=1 ("Edit this photo" on the workspace, edit-link.ts) opens the viewer on the edit form.
export function opensEditFrom(search: string): boolean {
  return opensEdit(new URLSearchParams(search).get(EDIT_QUERY) ?? undefined)
}

// Previous / next in the order Photos shows them; null at either end or off the list.
export function stepFrom(ids: readonly string[], current: string | null, delta: -1 | 1): string | null {
  const index = current ? ids.indexOf(current) : -1
  if (index < 0) return null
  return ids[index + delta] ?? null
}
