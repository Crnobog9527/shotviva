import { z } from 'zod'

// PVUV.ai's read API (https://api.pvuv.ai/docs/api.md, read 2026-11-22). Breakdown: GET
// /v1/sites/{site}/breakdown?dim=&period=&limit= with `Authorization: Bearer pvuv_…` (a read-only
// token). It answers { dim, rows, report: { state, … } }; `report.state` other than "ready" means
// the numbers are still being put together. The row fields are not documented, so a row is read
// leniently: its value from value / name / key, its people from visitors / uniques, its count from
// events / count / hits / pageviews; a field it does not have reads as null. Plain fetch, so
// tests inject a fake. The token is only ever in the Authorization header.

export const PVUV_API = 'https://api.pvuv.ai'
const TIMEOUT_MS = 10_000

export type PvuvAccess = { site: string; token: string }
export type PvuvPeriod = 'today' | '7d' | '30d'
export type PvuvRow = { value: string; visitors: number | null; events: number | null }
export type PvuvBreakdown = { ready: boolean; rows: PvuvRow[] }

// Thrown so a failure is never mistaken for zero. The message carries the status, never the token.
export class PvuvReadError extends Error {
  constructor(readonly status: number | null) {
    super(`pvuv read failed${status === null ? '' : ` (HTTP ${status})`}`)
    this.name = 'PvuvReadError'
  }
}

const answer = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  report: z.object({ state: z.string() }).partial().optional(),
})

const firstString = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) if (typeof row[key] === 'string' || typeof row[key] === 'number') return String(row[key])
  return null
}
const firstNumber = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) if (typeof row[key] === 'number' && Number.isFinite(row[key])) return row[key] as number
  return null
}

export function shapeBreakdown(body: unknown): PvuvBreakdown {
  const parsed = answer.safeParse(body)
  if (!parsed.success) throw new PvuvReadError(null)
  const rows = parsed.data.rows.flatMap((row): PvuvRow[] => {
    const value = firstString(row, ['value', 'name', 'key'])
    if (value === null) return []
    return [{ value, visitors: firstNumber(row, ['visitors', 'uniques', 'unique_visitors']), events: firstNumber(row, ['events', 'count', 'hits', 'pageviews']) }]
  })
  const state = parsed.data.report?.state
  return { ready: state === undefined || state === 'ready', rows }
}

type Fetch = typeof fetch

// One GET against the read API. Any failure (network, timeout, HTTP error, a body that is not
// JSON) throws PvuvReadError; the token is only in the Authorization header.
async function pvuvGet(access: PvuvAccess, path: string, params: Record<string, string>, fetcher: Fetch): Promise<unknown> {
  const url = new URL(`/v1/sites/${encodeURIComponent(access.site)}/${path}`, PVUV_API)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  let response: Response
  try {
    response = await fetcher(url, { headers: { authorization: `Bearer ${access.token}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch {
    throw new PvuvReadError(null)
  }
  if (!response.ok) throw new PvuvReadError(response.status)
  return response.json().catch(() => null)
}

export async function pvuvBreakdown(access: PvuvAccess, query: { dim: string; period: PvuvPeriod; limit: number }, fetcher: Fetch = fetch): Promise<PvuvBreakdown> {
  return shapeBreakdown(await pvuvGet(access, 'breakdown', { dim: query.dim, period: query.period, limit: String(query.limit) }, fetcher))
}

// /overview?period=&compare=true: { pv, uv (people, bots and crawlers left out), sessions,
// bounce_rate (0..1 | null), avg_duration_ms, …, previous: { same fields } }. pv and uv are
// required; the rest reads as null when missing, so it shows as 「—」, never as 0.
export type PvuvTotals = { pv: number; uv: number; sessions: number | null; bounceRate: number | null; avgDurationMs: number | null }
export type PvuvOverview = { current: PvuvTotals; previous: PvuvTotals | null }

const amount = z.number().finite().nonnegative()
const maybe = amount.nullable().optional().catch(null)
const totals = z.object({
  pv: amount,
  uv: amount,
  sessions: maybe,
  bounce_rate: z.number().min(0).max(1).nullable().optional().catch(null),
  avg_duration_ms: maybe,
  visit_duration_ms: maybe,
})
const overviewAnswer = totals.extend({ previous: totals.nullable().optional().catch(null) })

const totalsOf = (row: z.infer<typeof totals>): PvuvTotals => ({
  pv: row.pv,
  uv: row.uv,
  sessions: row.sessions ?? null,
  bounceRate: row.bounce_rate ?? null,
  avgDurationMs: row.avg_duration_ms ?? row.visit_duration_ms ?? null,
})

export function shapeOverview(body: unknown): PvuvOverview {
  const parsed = overviewAnswer.safeParse(body)
  if (!parsed.success) throw new PvuvReadError(null)
  return { current: totalsOf(parsed.data), previous: parsed.data.previous ? totalsOf(parsed.data.previous) : null }
}

export async function pvuvOverview(access: PvuvAccess, period: PvuvPeriod, fetcher: Fetch = fetch): Promise<PvuvOverview> {
  return shapeOverview(await pvuvGet(access, 'overview', { period, compare: 'true' }, fetcher))
}

// /funnels: the funnels saved in PVUV, { funnels: [{ funnel_id, name, steps, options }] }. Only
// the id and the name are used here; each funnel's numbers come from /funnel.
export type PvuvFunnelInfo = { id: string; name: string }

const funnelsAnswer = z.object({
  funnels: z.array(z.object({ funnel_id: z.union([z.string().min(1), z.number()]), name: z.string().nullable().optional() }).loose()),
})

export function shapeFunnels(body: unknown): PvuvFunnelInfo[] {
  const parsed = funnelsAnswer.safeParse(body)
  if (!parsed.success) throw new PvuvReadError(null)
  return parsed.data.funnels.map((funnel) => {
    const id = String(funnel.funnel_id)
    return { id, name: funnel.name?.trim() || id }
  })
}

export async function pvuvFunnels(access: PvuvAccess, fetcher: Fetch = fetch): Promise<PvuvFunnelInfo[]> {
  return shapeFunnels(await pvuvGet(access, 'funnels', {}, fetcher))
}

// /funnel?funnel_id=&period=: { steps: [{ label, visitors, dropped, conv_prev: { rate } | null,
// conv_first, low_sample, … }], side_steps: [same], entered, clean_only }. A rate is 0..1; null
// when PVUV has none (the first step has no step before it).
export type PvuvFunnelStep = { label: string; visitors: number; convPrev: number | null; convFirst: number | null; lowSample: boolean }
export type PvuvFunnel = { steps: PvuvFunnelStep[]; sideSteps: PvuvFunnelStep[]; entered: number | null; cleanOnly: boolean }

const conversion = z.object({ rate: z.number().finite().nullable().optional() }).loose().nullable().optional().catch(null)
const stepAnswer = z
  .object({
    label: z.string().nullable().optional(),
    value: z.unknown().optional(),
    visitors: amount,
    conv_prev: conversion,
    conv_first: conversion,
    low_sample: z.boolean().optional().catch(false),
  })
  .loose()
const funnelAnswer = z.object({
  steps: z.array(stepAnswer),
  side_steps: z.array(stepAnswer).optional().catch([]),
  entered: maybe,
  clean_only: z.boolean().optional().catch(false),
})

const rateOf = (value: z.infer<typeof conversion>) => (typeof value?.rate === 'number' ? Math.min(1, Math.max(0, value.rate)) : null)

const stepOf = (step: z.infer<typeof stepAnswer>, index: number): PvuvFunnelStep => ({
  label: step.label?.trim() || (typeof step.value === 'string' && step.value) || `#${index + 1}`,
  visitors: step.visitors,
  convPrev: rateOf(step.conv_prev),
  convFirst: rateOf(step.conv_first),
  lowSample: step.low_sample ?? false,
})

export function shapeFunnel(body: unknown): PvuvFunnel {
  const parsed = funnelAnswer.safeParse(body)
  if (!parsed.success) throw new PvuvReadError(null)
  return {
    steps: parsed.data.steps.map(stepOf),
    sideSteps: (parsed.data.side_steps ?? []).map(stepOf),
    entered: parsed.data.entered ?? null,
    cleanOnly: parsed.data.clean_only ?? false,
  }
}

export async function pvuvFunnel(access: PvuvAccess, query: { id: string; period: PvuvPeriod }, fetcher: Fetch = fetch): Promise<PvuvFunnel> {
  return shapeFunnel(await pvuvGet(access, 'funnel', { funnel_id: query.id, period: query.period }, fetcher))
}
