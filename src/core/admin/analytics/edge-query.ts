import { z } from 'zod'

import { RANGE_DAYS, type Range } from './range'

const host = 'shotviva.com'
const uaMarkers = [
  'HeadlessChrome',
  'Playwright',
  'curl/',
  'python-requests/',
  'python-httpx/',
  'Go-http-client/',
  'GPTBot',
  'bingbot',
  'Googlebot',
]
const metricKey = 'vercel_request_count_sum'
const rowLimit = 100
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const countsSchema = z
  .object({ requests: amount, verified: amount, suspected: amount, unclassified: amount })
  .refine((v) => v.requests === v.verified + v.suspected + v.unclassified)
const botName = z.string().regex(/^[a-z][a-z0-9_. -]{0,79}$/i)
const date = z.iso.datetime()
const edgeSchema = z
  .object({
    start: date,
    end: date,
    host: z.literal(host),
    firstNonzeroBucket: date,
    lastNonzeroBucket: date,
    all: countsSchema,
    home: z.object({ '/': countsSchema, '/zh': countsSchema }).optional(),
    verifiedBots: z.record(botName, amount),
  })
  .refine(
    (v) =>
      Date.parse(v.start) < Date.parse(v.end) &&
      Date.parse(v.firstNonzeroBucket) <= Date.parse(v.lastNonzeroBucket) &&
      Date.parse(v.firstNonzeroBucket) >= Math.floor(Date.parse(v.start) / 3_600_000) * 3_600_000 &&
      Date.parse(v.lastNonzeroBucket) <= Date.parse(v.end) &&
      v.all.requests > 0 &&
      Object.values(v.verifiedBots).reduce((sum, n) => sum + n, 0) === v.all.verified,
  )
export type EdgeData = z.infer<typeof edgeSchema>
export type EdgeReason = 'unconfigured' | 'denied' | 'unavailable' | 'expired' | 'noCoverage'
export class EdgeQueryError extends Error {
  readonly reason: EdgeReason
  constructor(reason: EdgeReason) {
    super(reason)
    this.reason = reason
  }
}

type Window = { start: string; end: string; bucketMinutes: number }

// Vercel expands unaligned timestamps to entire buckets. Request only closed buckets and
// compare against the effective upstream window before publishing any result.
export function edgeWindow(range: Range, now: number): Window {
  const bucketMinutes = range === 'today' ? 5 : 60
  const width = bucketMinutes * 60_000
  const end = Math.floor(now / width) * width
  const day = 86_400_000
  const offset = 8 * 3_600_000
  // Beijing days, like every other block (range.ts).
  const start = Math.floor((now + offset) / day) * day - offset - (RANGE_DAYS[range] - 1) * day
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), bucketMinutes }
}
type Scope = { ownerId: string; projectId: string }
const groupRow = z.object({
  [metricKey]: amount,
  bot_verified: z.string().nullable(),
  bot_name: z.string().nullable(),
  request_path: z.enum(['/', '/zh']).optional(),
})
const hours = z.array(z.object({ timestamp: date, [metricKey]: amount.nullable() }))
const groups = z.object({ summary: z.array(groupRow).max(rowLimit - 1) })
type Row = z.infer<typeof groupRow>
type Run = (body: Record<string, unknown>) => Promise<unknown>

export function parseEdgeSnapshot(input?: string): EdgeData | null {
  if (!input) return null
  try {
    return edgeSchema.parse(JSON.parse(input))
  } catch {
    return null
  }
}

function reader(run: Run, scope: Scope, window: Window) {
  return async (groupBy: string[], conditions: string[]) => {
    const result = await run({
      scope: { type: 'project', ownerId: scope.ownerId, projectIds: [scope.projectId] },
      metric: 'vercel.request.count',
      aggregation: 'sum',
      groupBy,
      filter: ["environment eq 'production'", `request_hostname eq '${host}'`, ...conditions].join(' and '),
      startTime: window.start,
      endTime: window.end,
      granularity: window.bucketMinutes === 60 ? { hours: 1 } : { minutes: window.bucketMinutes },
      limit: rowLimit,
    })
    const actual = z.object({ query: z.object({ startTime: date, endTime: date }) }).parse(result).query
    if (Date.parse(actual.startTime) !== Date.parse(window.start) || Date.parse(actual.endTime) !== Date.parse(window.end)) {
      throw new EdgeQueryError('noCoverage')
    }
    return result
  }
}

function classification(row: Row) {
  if (row.bot_verified === 'pass') return 'verified'
  if (row.bot_name || row.bot_verified === 'fail' || row.bot_verified === 'spoofed') return 'suspected'
  return 'unclassified'
}

function counts(rows: Row[], markers: Row[]) {
  const result = { requests: 0, verified: 0, suspected: 0, unclassified: 0 }
  for (const row of rows) {
    result.requests += row[metricKey]
    result[classification(row)] += row[metricKey]
  }
  // Only unclassified UA matches are moved. Verified or named services are already counted.
  const extra = markers.filter((row) => classification(row) === 'unclassified').reduce((sum, row) => sum + row[metricKey], 0)
  result.suspected += extra
  result.unclassified -= extra
  return countsSchema.parse(result)
}

const uaFilter = `(${uaMarkers.map((s) => `contains(client_user_agent, '${s}')`).join(' or ')})`
const dims = ['bot_verified', 'bot_name']

export async function queryEdge(run: Run, scope: Scope, window: Window, includeHome = false): Promise<EdgeData> {
  if (window.start === window.end) throw new EdgeQueryError('noCoverage')
  const read = reader(run, scope, window)
  const result = z.object({ data: hours, summary: groups.shape.summary }).parse(await read(dims, []))
  const active = result.data
    .filter((r) => (r[metricKey] ?? 0) > 0)
    .map((r) => r.timestamp)
    .sort()
  if (!active.length) throw new EdgeQueryError('noCoverage')
  // Read the costly UA dimension only for buckets that the first pass proves can contain hits.
  const observed = {
    start: active[0],
    end: new Date(Date.parse(active[active.length - 1]) + window.bucketMinutes * 60_000).toISOString(),
    bucketMinutes: window.bucketMinutes,
  }
  const readObserved = reader(run, scope, observed)
  const markers = groups.parse(await readObserved(dims, [uaFilter])).summary
  const all = counts(result.summary, markers)
  const bucketSum = result.data.reduce((sum, r) => sum + (r[metricKey] ?? 0), 0)
  if (all.requests !== bucketSum) throw new EdgeQueryError('noCoverage')
  const verifiedBots = Object.fromEntries(
    result.summary.filter((r) => r.bot_verified === 'pass').map((r) => [r.bot_name || 'unspecified', r[metricKey]]),
  )
  const data = {
    start: window.start,
    end: window.end,
    host,
    firstNonzeroBucket: active[0],
    lastNonzeroBucket: active[active.length - 1],
    all,
    verifiedBots,
  }
  if (!includeHome) return edgeSchema.parse(data)
  // Path dimensions are more expensive; fetch only for an explicit offline audit.
  const pathDims = ['request_path', ...dims]
  const homeFilter = "(request_path eq '/' or request_path eq '/zh')"
  const homepage = groups.parse(await readObserved(pathDims, [homeFilter])).summary
  const homeMarkers = groups.parse(await readObserved(pathDims, [homeFilter, uaFilter])).summary
  const home = Object.fromEntries(
    ['/', '/zh'].map((p) => [
      p,
      counts(
        homepage.filter((r) => r.request_path === p),
        homeMarkers.filter((r) => r.request_path === p),
      ),
    ]),
  )
  return edgeSchema.parse({ ...data, home })
}
