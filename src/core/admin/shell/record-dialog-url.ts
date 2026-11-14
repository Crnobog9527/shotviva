// A list page's record dialog lives in the URL, like the user dialog (T77): /admin/tickets?ticket=<id>
// shows that ticket over the list, /admin/inquiries?inquiry=<id> that inquiry. The list's own
// params (filter, cursor) stay, so closing lands on the same list, at the same scroll position.

import type { HistoryPort } from '../users-ui/dialog-history'

export const TICKET_PARAM = 'ticket'
export const INQUIRY_PARAM = 'inquiry'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isRecordId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function withRecord(href: string, param: string, id: string): string {
  const url = new URL(href, 'http://admin.local')
  url.searchParams.set(param, id)
  return `${url.pathname}${url.search}${url.hash}`
}

export function withoutRecord(href: string, param: string): string {
  const url = new URL(href, 'http://admin.local')
  url.searchParams.delete(param)
  return `${url.pathname}${url.search}${url.hash}`
}

// History entries the dialog pushed itself carry this mark, so closing steps back over them (the
// phone's back button closes the dialog too); a deep link has no such entry and drops the param.
const stateKey = (param: string) => `svRecordDialog:${param}`

function owns(state: unknown, param: string): boolean {
  return typeof state === 'object' && state !== null && stateKey(param) in state
}

export function openRecord(port: HistoryPort, param: string, id: string) {
  const url = withRecord(port.href(), param, id)
  const marked = { [stateKey(param)]: true }
  if (owns(port.state(), param)) port.replace(marked, url)
  else port.push(marked, url)
}

export function closeRecord(port: HistoryPort, param: string) {
  if (owns(port.state(), param)) port.back()
  else port.replace(null, withoutRecord(port.href(), param))
}
