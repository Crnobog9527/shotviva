// The page's time ranges (ARCHITECTURE §16.2a/§16.2b): today, 7 days, 30 days in Beijing days,
// the way the overview counts them (admin_dashboard_stats: today and the 6 days before it). Each
// is compared with the same number of days just before it, up to the same time of day, so a
// period that is still running is never compared with a finished one.

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

export const RANGE_DAYS: Record<Range, number> = { today: 1, '7d': 7, '30d': 30 }

export function windowFor(range: Range, now: Date): Window {
  const end = now.getTime()
  const days = RANGE_DAYS[range]
  const span = days * DAY_MS
  const start = beijingMidnight(now) - (days - 1) * DAY_MS
  const iso = (ms: number) => new Date(ms).toISOString()
  return { range, start: iso(start), end: iso(end), prevStart: iso(start - span), prevEnd: iso(end - span) }
}
