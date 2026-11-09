import { z } from 'zod'

import { FUNNEL_STEPS, type FunnelDim, type FunnelGroup } from './funnel-options'
import { at, bothPeriods, eventList, periodColumn } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { entryChannel } from './traffic'
import { publicEntry, publicEvent, publicJourney } from './traffic-scope'
import { count, flag, label } from './values'

export * from './funnel-options'

// Block 2 「转化漏斗」 (ARCHITECTURE §16.2a): 进站 → 上传 → 出图 → 付费墙 → 开始结账 → 付款, per person
// and period. A person reaches a step when they did it, at or after the step before (first time
// each), inside the same period. Split by one dimension of the person's first page view. The
// inner columns (in_current, first_value) are named apart from the outer aliases (cur, seg), so
// HogQL never has to choose between p.seg and the new / returning label (control review of #280).

// What the person's first page view says about them.
const DIM_EXPR: Record<Exclude<FunnelDim, 'visitor'>, string> = {
  none: "'all'",
  locale: "if(properties.locale IN ('en','zh'), properties.locale, '')",
  device: "if(properties.$device_type IN ('Desktop','Mobile','Tablet'), properties.$device_type, '')",
  source: `if(${publicEntry('session.')}, ${entryChannel('session.')}, 'unknown')`,
  country: "if(match(properties.$geoip_country_code, '^[A-Z]{2}$'), properties.$geoip_country_code, '')",
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
  if (dim !== 'visitor') return { seg: 'p.first_value', join: '' }
  const back = (start: string) => at(new Date(Date.parse(start) - LOOKBACK_DAYS * 86_400_000).toISOString())
  return {
    seg: "if(if(p.in_current, f.prior_current, f.prior_previous) > 0, 'returning', 'new')",
    join: `LEFT JOIN (
  SELECT person_id, countIf(timestamp >= ${back(window.start)}) AS prior_current,
    countIf(timestamp < ${at(window.prevStart)}) AS prior_previous FROM events
  WHERE event = '$pageview' AND ${publicEvent} AND timestamp >= ${back(window.prevStart)} AND timestamp < ${at(window.start)}
  GROUP BY person_id
) AS f ON f.person_id = p.person_id`,
  }
}

function people(window: Window, fields: string): string {
  return `SELECT person_id, ${periodColumn(window)} AS in_current, ${fields},
    ${stepColumns()}
  FROM events
  WHERE event IN (${eventList(FUNNEL_STEPS.map((step) => step.event))}) AND ${bothPeriods(window)} AND ${publicJourney}
  GROUP BY person_id, in_current`
}

function firstValue(expr: string) {
  return `argMinIf(coalesce(toString(${expr}), ''), timestamp, event = '$pageview')`
}

export function funnelQuery(window: Window, dim: FunnelDim): HogQL {
  const { seg, join } = segmentSource(window, dim)
  const first = DIM_EXPR[dim === 'visitor' ? 'none' : dim]
  return {
    name: `funnel.${dim}`,
    query: `
SELECT p.in_current AS cur, ${seg} AS seg, ${reachedColumns()}
FROM (
  ${people(window, `${firstValue(first)} AS first_value`)}
) AS p
${join}
WHERE p.h0
GROUP BY cur, seg ORDER BY s0 DESC LIMIT 2000`,
  }
}

// Aggregate the journey once per person. Expand the three small breakdowns only after that
// aggregation; the ungrouped totals come from the locale rows. Fetch session attribution or the 90-day join only when selected.
const BREAKDOWNS = ['locale', 'device', 'country'] as const
export function breakdownsQuery(window: Window): HogQL {
  const fields = BREAKDOWNS.map((dim) => `${firstValue(DIM_EXPR[dim])} AS by_${dim}`).join(', ')
  const segments = BREAKDOWNS.map((dim) => `tuple('${dim}', p.by_${dim})`).join(', ')
  return { name: 'funnel.breakdowns', query: `
SELECT p.in_current AS cur, tupleElement(bucket, 1) AS dim, tupleElement(bucket, 2) AS seg, ${reachedColumns()}
FROM (${people(window, fields)}) AS p
ARRAY JOIN [${segments}] AS bucket
WHERE p.h0 GROUP BY cur, dim, seg ORDER BY s0 DESC LIMIT 2000` }
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
  const shown = segments.filter((segment) => segment.value !== '').slice(0, dim === 'source' ? undefined : MAX_SEGMENTS)
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

export type FunnelData = Partial<Record<FunnelDim, Funnel>>

export async function loadFunnelGroup(run: RunQuery, window: Window, group: FunnelGroup): Promise<FunnelData> {
  if (group !== 'breakdowns') {
    const funnel = await loadFunnel(run, window, group)
    return { [group]: funnel, none: { ...funnel, dim: 'none', segments: [] } }
  }
  const rows = rowsOf(await run(breakdownsQuery(window)), funnelRow.extend({dim: z.enum(BREAKDOWNS)}))
  const result: FunnelData = {}
  for (const dim of BREAKDOWNS) result[dim] = shapeFunnel(rows.filter((row) => row.dim === dim), dim)
  result.none = shapeFunnel(rows.filter((row) => row.dim === 'locale'), 'none')
  return result
}
