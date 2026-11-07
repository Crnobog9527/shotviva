// The user detail dialog lives in the URL (ARCHITECTURE §10.a, T77): ?user=<id>, plus ?userJob=<id>
// when a lookup landed on one job. Any admin page can carry it, so a link from the jobs, orders
// or tickets page opens the dialog on that page, over what the admin was looking at.

export const USER_PARAM = 'user'
export const JOB_PARAM = 'userJob'

// Marks history entries the dialog pushed itself, so closing can step back instead of leaving a
// stale entry behind (and the phone's back button closes it).
export const DIALOG_STATE_KEY = 'svUserDialog'

// The current address with the dialog showing this user; other query params are kept.
export function withUser(href: string, userId: string, jobId: string | null = null): string {
  const url = new URL(href, 'http://admin.local')
  url.searchParams.set(USER_PARAM, userId)
  if (jobId) url.searchParams.set(JOB_PARAM, jobId)
  else url.searchParams.delete(JOB_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

// The current address without the dialog.
export function withoutUser(href: string): string {
  const url = new URL(href, 'http://admin.local')
  url.searchParams.delete(USER_PARAM)
  url.searchParams.delete(JOB_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

// Plain clicks open the dialog in place; a modified click (new tab or window) follows the link.
export function isPlainClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
