import { z } from 'zod'

import { at, bothPeriods, eventList, periodColumn } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { count, flag, label } from './values'

// Block 2 「转化漏斗」 (ARCHITECTURE §16.2a): 进站 → 上传 → 出图 → 付费墙 → 开始结账 → 付款, per person
// and period. A person reaches a step when they did it, at or after the step before (first time
// each), inside the same period. Split by one dimension of the person's first page view.

export const FUNNEL_STEPS = [
  { key: 'visit', event: '$pageview', where: '' },
  { key: 'upload', event: 'upload', where: '' },
  // An image the person actually got.
  { key: 'generate', event: 'generate', where: "AND properties.status = 'succeeded'" },
  { key: 'paywall', event: 'paywall_view', where: '' },
  { key: 'checkout', event: 'checkout_start', where: '' },
  { key: 'purchase', event: 'purchase', where: '' },
] as const
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]['key']

export const FUNNEL_DIMS = ['none', 'locale', 'device', 'source', 'country', 'visitor'] as const
export type FunnelDim = (typeof FUNNEL_DIMS)[number]

export function parseFunnelDim(value: unknown): FunnelDim {
  return typeof value === 'string' && (FUNNEL_DIMS as readonly string[]).includes(value) ? (value as FunnelDim) : 'none'
}

// What the person's first page view says about them.
const DIM_EXPR: Record<Exclude<FunnelDim, 'visitor'>, string> = {
  none: "'all'",
  locale: 'properties.locale',
  device: 'properties.$device_type',
  source: "coalesce(nullIf(properties.$referring_domain, ''), '$direct')",
  country: 'properties.$geoip_country_code',
}

// New = first page view ever (90 days back) inside the period; anything earlier is returning.
const LOOKBACK_DAYS = 90

function stepColumns(): string {
  return FUNNEL_STEPS.map(
    (step, i) => `countIf(event = '${step.event}' ${step.where}) > 0 AS h${i}, minIf(timestamp, event = '${step.event}' ${step.where}) AS t${i}`,
  ).join(',\n    ')
}

// Step i is reached when every step up to it happened, each not before the one before it.
function reachedColumns(): string {
  return FUNNEL_STEPS.map((_, i) => {
    const conditions = Array.from({ length: i + 1 }, (_, k) => (k === 0 ? 'h0' : `h${k} AND t${k} >= t${k - 1}`))
    return `countIf(${conditions.join(' AND ')}) AS s${i}`
  }).join(', ')
}

function segmentSource(window: Window, dim: FunnelDim): { seg: string; join: string } {
  if (dim !== 'visitor') return { seg: 'p.seg', join: '' }
  const lookback = new Date(Date.parse(window.prevStart) - LOOKBACK_DAYS * 86_400_000).toISOString()
  return {
    seg: `if(f.first_seen >= if(p.cur, ${at(window.start)}, ${at(window.prevStart)}), 'new', 'returning')`,
    join: `LEFT JOIN (
  SELECT person_id, min(timestamp) AS first_seen FROM events
  WHERE event = '$pageview' AND timestamp >= ${at(lookback)} AND timestamp < ${at(window.end)}
  GROUP BY person_id
) AS f ON f.person_id = p.person_id`,
  }
}

export function funnelQuery(window: Window, dim: FunnelDim): HogQL {
  const { seg, join } = segmentSource(window, dim)
  const first = DIM_EXPR[dim === 'visitor' ? 'none' : dim]
  return {
    name: `funnel.${dim}`,
    query: `
SELECT cur, ${seg} AS seg, ${reachedColumns()}
FROM (
  SELECT person_id, ${periodColumn(window)} AS cur,
    argMinIf(toString(${first}), timestamp, event = '$pageview') AS seg,
    ${stepColumns()}
  FROM events
  WHERE event IN (${eventList(FUNNEL_STEPS.map((step) => step.event))}) AND ${bothPeriods(window)}
  GROUP BY person_id, cur
) AS p
${join}
WHERE p.h0
GROUP BY cur, seg ORDER BY s0 DESC LIMIT 200`,
  }
}

const funnelRow = z.object({
  cur: flag,
  seg: label,
  s0: count,
  s1: count,
  s2: count,
  s3: count,
  s4: count,
  s5: count,
})

export type FunnelCounts = readonly number[]
export type FunnelSegment = { value: string; counts: FunnelCounts }
export type Funnel = { dim: FunnelDim; current: FunnelCounts; previous: FunnelCounts; segments: FunnelSegment[] }

// The biggest groups by entries; the rest are summed into one 「其他」 row (value '').
export const MAX_SEGMENTS = 6

const zero = () => FUNNEL_STEPS.map(() => 0)
const add = (a: readonly number[], b: readonly number[]) => a.map((value, i) => value + (b[i] ?? 0))
const countsOf = (row: z.infer<typeof funnelRow>) => [row.s0, row.s1, row.s2, row.s3, row.s4, row.s5]

export function shapeFunnel(rows: z.infer<typeof funnelRow>[], dim: FunnelDim): Funnel {
  const current = rows.filter((row) => row.cur)
  const previous = rows.filter((row) => !row.cur)
  const segments = current.map((row) => ({ value: row.seg, counts: countsOf(row) })).sort((a, b) => (b.counts[0] ?? 0) - (a.counts[0] ?? 0))
  const shown = segments.filter((segment) => segment.value !== '').slice(0, MAX_SEGMENTS)
  const rest = segments.filter((segment) => !shown.includes(segment))
  const other = rest.length ? [{ value: '', counts: rest.reduce((sum, segment) => add(sum, segment.counts), zero()) }] : []
  return {
    dim,
    current: current.reduce((sum, row) => add(sum, countsOf(row)), zero()),
    previous: previous.reduce((sum, row) => add(sum, countsOf(row)), zero()),
    segments: dim === 'none' ? [] : [...shown, ...other],
  }
}

export async function loadFunnel(run: RunQuery, window: Window, dim: FunnelDim): Promise<Funnel> {
  return shapeFunnel(rowsOf(await run(funnelQuery(window, dim)), funnelRow), dim)
}
