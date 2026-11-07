// The page's time ranges (ARCHITECTURE §16.2a): today, 7 days, 30 days, each compared with the
// period just before it. "Today" is the Beijing day the rest of the admin uses (shell/format.ts),
// compared with yesterday up to the same time.

export const RANGES = ['today', '7d', '30d'] as const
export type Range = (typeof RANGES)[number]
export const DEFAULT_RANGE: Range = '7d'

export function parseRange(value: unknown): Range {
  return typeof value === 'string' && (RANGES as readonly string[]).includes(value) ? (value as Range) : DEFAULT_RANGE
}

// [start, end) is the current period, [prevStart, prevEnd) the one before; ISO strings in UTC.
export type Window = { range: Range; start: string; end: string; prevStart: string; prevEnd: string }

const DAY_MS = 86_400_000
const BEIJING_OFFSET_MS = 8 * 3_600_000

function beijingMidnight(now: Date): number {
  const local = now.getTime() + BEIJING_OFFSET_MS
  return local - (local % DAY_MS) - BEIJING_OFFSET_MS
}

export function windowFor(range: Range, now: Date): Window {
  const end = now.getTime()
  const span = range === 'today' ? DAY_MS : (range === '7d' ? 7 : 30) * DAY_MS
  const start = range === 'today' ? beijingMidnight(now) : end - span
  const iso = (ms: number) => new Date(ms).toISOString()
  return { range, start: iso(start), end: iso(end), prevStart: iso(start - span), prevEnd: iso(end - span) }
}
