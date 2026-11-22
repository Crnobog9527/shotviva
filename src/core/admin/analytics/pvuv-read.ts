import { z } from 'zod'

// PVUV.ai's read API (https://api.pvuv.ai/docs/api.md, read 2026-11-22): GET
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

export async function pvuvBreakdown(access: PvuvAccess, query: { dim: string; period: PvuvPeriod; limit: number }, fetcher: Fetch = fetch): Promise<PvuvBreakdown> {
  const url = new URL(`/v1/sites/${encodeURIComponent(access.site)}/breakdown`, PVUV_API)
  url.searchParams.set('dim', query.dim)
  url.searchParams.set('period', query.period)
  url.searchParams.set('limit', String(query.limit))
  let response: Response
  try {
    response = await fetcher(url, { headers: { authorization: `Bearer ${access.token}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch {
    throw new PvuvReadError(null)
  }
  if (!response.ok) throw new PvuvReadError(response.status)
  return shapeBreakdown(await response.json().catch(() => null))
}
