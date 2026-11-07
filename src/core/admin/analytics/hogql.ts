import type { Window } from './range'

// Shared HogQL pieces. Every value spliced into a query is ours (ISO timestamps from windowFor,
// fixed event names, numbers); nothing a visitor typed ever reaches a query string.

// A timestamp literal. The Z suffix makes the value UTC whatever the project's time zone is.
export const at = (iso: string) => `toDateTime('${iso.replace(/[^0-9TZ:.-]/g, '')}')`

// Both periods: [prevStart, prevEnd) and [start, end); periodColumn then tells them apart. For
// "today" the stretch from yesterday at this time to midnight is in neither.
export function bothPeriods(window: Window, column = 'timestamp'): string {
  return `((${column} >= ${at(window.prevStart)} AND ${column} < ${at(window.prevEnd)}) OR (${currentPeriod(window, column)}))`
}

export function currentPeriod(window: Window, column = 'timestamp'): string {
  return `${column} >= ${at(window.start)} AND ${column} < ${at(window.end)}`
}

// True for a row of the current period, within a bothPeriods filter.
export function periodColumn(window: Window, column = 'timestamp'): string {
  return `${column} >= ${at(window.start)}`
}

// One row per page, not per photo or work: ids in a path become :id. Template workspaces keep
// their slug (/generate/ramen-studio), which is the page.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const pagePath = (expr: string) => `replaceRegexpAll(coalesce(toString(${expr}), ''), '${UUID}', ':id')`

export const eventList = (events: readonly string[]) => events.map((event) => `'${event.replace(/[^a-z0-9_$]/gi, '')}'`).join(', ')
