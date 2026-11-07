// Where the Help & feedback dialog on /account stands (ARCHITECTURE §10 「在弹窗里完成」, T68):
// `?help=new`, `?help=list` or `?help=<ticket id>`. Anything else reads as closed. Client-safe
// and dependency-free (no zod in the account page's bundle for one id check).

export const HELP_PARAM = 'help'

export type HelpView = { tab: 'new' } | { tab: 'list' } | { tab: 'thread'; id: string }

// The tab a view lights up: a ticket's thread belongs to "My tickets".
export type HelpTab = 'new' | 'list'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isTicketId(value: string): boolean {
  return UUID.test(value)
}

export function parseHelpParam(value: string | null | undefined): HelpView | null {
  if (!value) return null
  if (value === 'new' || value === 'list') return { tab: value }
  return isTicketId(value) ? { tab: 'thread', id: value.toLowerCase() } : null
}

export function helpParamValue(view: HelpView): string {
  return view.tab === 'thread' ? view.id : view.tab
}

export function tabOf(view: HelpView): HelpTab {
  return view.tab === 'new' ? 'new' : 'list'
}

// The account page with the dialog open at `view` (a logical, unprefixed path).
export function helpHref(view: HelpView): string {
  return `/account?${HELP_PARAM}=${helpParamValue(view)}`
}

// The old flow pages are deep links now: /account/help → list, /account/help/new → new,
// /account/help/<id> → that ticket. A malformed id lands on the list rather than a 404.
export function legacyHelpTarget(segment?: string): string {
  if (segment === undefined) return helpHref({ tab: 'list' })
  if (segment === 'new') return helpHref({ tab: 'new' })
  return helpHref(parseHelpParam(segment) ?? { tab: 'list' })
}
