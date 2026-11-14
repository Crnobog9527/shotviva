// The 「漏斗」 and 「模板」 tabs' date range (ARCHITECTURE §16.2c): two Beijing calendar days, both
// included, at most 92 days apart, never past today. Default: the last 28 days up to today.
// Buckets are Beijing days or weeks starting on Monday.

export const BUCKETS = ['day', 'week'] as const
export type Bucket = (typeof BUCKETS)[number]

export const MAX_DAYS = 92
export const DEFAULT_DAYS = 28

const DAY_MS = 86_400_000
const BEIJING_OFFSET_MS = 8 * 3_600_000
const DATE = /^\d{4}-\d{2}-\d{2}$/

// [start, end) in UTC; `end` is the read's moment when the range ends today.
export type Period = { from: string; to: string; start: string; end: string; days: number }

// A Beijing date as YYYY-MM-DD.
export function beijingDate(ms: number): string {
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, 10)
}

// Midnight in Beijing of a YYYY-MM-DD date, in UTC milliseconds; NaN for a bad date.
function midnight(date: string): number {
  if (!DATE.test(date)) return Number.NaN
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(ms) || beijingDate(ms) !== date ? Number.NaN : ms - BEIJING_OFFSET_MS
}

export function parseBucket(value: unknown): Bucket {
  return value === 'week' ? 'week' : 'day'
}

// Bad, reversed or future dates fall back to the default; a range longer than 92 days keeps its
// end and is cut to 92 days.
export function parsePeriod(fromValue: unknown, toValue: unknown, now: number): Period {
  const today = beijingDate(now)
  const todayStart = midnight(today)
  let toStart = typeof toValue === 'string' ? midnight(toValue) : Number.NaN
  if (Number.isNaN(toStart) || toStart > todayStart) toStart = todayStart
  let fromStart = typeof fromValue === 'string' ? midnight(fromValue) : Number.NaN
  if (Number.isNaN(fromStart) || fromStart > toStart) fromStart = toStart - (DEFAULT_DAYS - 1) * DAY_MS
  fromStart = Math.max(fromStart, toStart - (MAX_DAYS - 1) * DAY_MS)
  const endMs = Math.min(toStart + DAY_MS, now)
  return {
    from: beijingDate(fromStart),
    to: beijingDate(toStart),
    start: new Date(fromStart).toISOString(),
    end: new Date(endMs).toISOString(),
    days: Math.round((toStart - fromStart) / DAY_MS) + 1,
  }
}

// The bucket a moment falls in: its Beijing date, or the Monday of its Beijing week.
export function bucketOf(iso: string, bucket: Bucket): string {
  const ms = Date.parse(iso)
  const date = beijingDate(ms)
  if (bucket === 'day') return date
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
  return beijingDate(midnight(date) - weekday * DAY_MS)
}

// Every bucket of the period, oldest first, so a day with nobody still gets its row.
export function bucketsOf(period: Period, bucket: Bucket): string[] {
  const keys: string[] = []
  for (let ms = midnight(period.from); ms <= midnight(period.to); ms += DAY_MS) {
    const key = bucketOf(new Date(ms).toISOString(), bucket)
    if (keys.at(-1) !== key) keys.push(key)
  }
  return keys
}
