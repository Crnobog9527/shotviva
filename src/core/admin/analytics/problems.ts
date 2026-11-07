import { z } from 'zod'

import { bothPeriods, currentPeriod, pagePath, periodColumn } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { count, label, maybe, rate } from './values'

// Block 6 「体验问题」 (ARCHITECTURE §16.2a): failed uploads (upload_error reasons) and failed images
// (generate error codes) against all attempts, with the period before; and how fast each page
// really opens for visitors ($web_vitals: the 75th percentile, as Google judges it), slowest first.

const OK = '__ok__'

export function failuresQuery(window: Window): HogQL {
  return {
    name: 'problems.failures',
    query: `
SELECT kind, reason, countIf(cur) AS n, countIf(NOT cur) AS n_prev
FROM (
  SELECT ${periodColumn(window)} AS cur,
    if(event IN ('upload', 'upload_error'), 'upload', 'generate') AS kind,
    multiIf(event = 'upload_error', toString(properties.reason),
      event = 'generate' AND properties.status = 'failed', coalesce(toString(properties.error_code), 'UNKNOWN'),
      '${OK}') AS reason
  FROM events WHERE event IN ('upload', 'upload_error', 'generate') AND ${bothPeriods(window)}
)
GROUP BY kind, reason ORDER BY n DESC LIMIT 60`,
  }
}

export function vitalsQuery(window: Window): HogQL {
  const p75 = (metric: string) => `quantile(0.75)(toFloat(properties.$web_vitals_${metric}_value))`
  return {
    name: 'problems.vitals',
    query: `
SELECT ${pagePath('properties.$pathname')} AS path, count() AS samples,
  ${p75('LCP')} AS lcp, ${p75('INP')} AS inp, ${p75('CLS')} AS cls, ${p75('FCP')} AS fcp
FROM events WHERE event = '$web_vitals' AND ${currentPeriod(window)}
GROUP BY path HAVING samples >= 3 AND path != '' ORDER BY lcp DESC LIMIT 20`,
  }
}

const failureRow = z.object({ kind: z.enum(['upload', 'generate']), reason: label, n: count, n_prev: count })
const vitalsRow = z.object({ path: label, samples: count, lcp: maybe, inp: maybe, cls: maybe, fcp: maybe })

export type Reason = { reason: string; count: number; previous: number }
export type FailureStats = { attempts: number; failed: number; failedPrev: number; rate: number | null; ratePrev: number | null; reasons: Reason[] }
// Milliseconds for LCP / INP / FCP; CLS has no unit.
export type PageVitals = { path: string; samples: number; lcp: number | null; inp: number | null; cls: number | null; fcp: number | null }
export type Problems = { uploads: FailureStats; images: FailureStats; vitals: PageVitals[] }

function failureStats(rows: z.infer<typeof failureRow>[], kind: 'upload' | 'generate'): FailureStats {
  const mine = rows.filter((row) => row.kind === kind)
  const failures = mine.filter((row) => row.reason !== OK)
  const failed = failures.reduce((sum, row) => sum + row.n, 0)
  const failedPrev = failures.reduce((sum, row) => sum + row.n_prev, 0)
  const attempts = mine.reduce((sum, row) => sum + row.n, 0)
  const attemptsPrev = mine.reduce((sum, row) => sum + row.n_prev, 0)
  return {
    attempts,
    failed,
    failedPrev,
    rate: rate(failed, attempts),
    ratePrev: rate(failedPrev, attemptsPrev),
    reasons: failures
      .filter((row) => row.n > 0)
      .map((row) => ({ reason: row.reason, count: row.n, previous: row.n_prev }))
      .sort((a, b) => b.count - a.count),
  }
}

// Slowest first by LCP, then INP; pages without either go last.
export function slowestFirst(rows: readonly PageVitals[]): PageVitals[] {
  return [...rows].sort((a, b) => (b.lcp ?? -1) - (a.lcp ?? -1) || (b.inp ?? -1) - (a.inp ?? -1))
}

export function shapeProblems(failures: z.infer<typeof failureRow>[], vitals: z.infer<typeof vitalsRow>[]): Problems {
  return { uploads: failureStats(failures, 'upload'), images: failureStats(failures, 'generate'), vitals: slowestFirst(vitals) }
}

export async function loadProblems(run: RunQuery, window: Window): Promise<Problems> {
  const failures = rowsOf(await run(failuresQuery(window)), failureRow)
  const vitals = rowsOf(await run(vitalsQuery(window)), vitalsRow)
  return shapeProblems(failures, vitals)
}
