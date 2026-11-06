// /admin/costs rows (ARCHITECTURE §10.0): per UTC day, what OpenAI billed next to what our jobs
// add up to. Pure, so the page's numbers are tested without either side.

export type OurDay = { day: string; cost_usd: number; costed: number; uncosted: number; no_usage: number }

export type ReconcileRow = OurDay & {
  // null: no Admin key, or OpenAI could not be read.
  billed: number | null
  // billed − ours; positive means OpenAI charged more than we recorded.
  difference: number | null
}

// Consecutive days on which ours and billed differ by more than STALE_DRIFT: the price table
// (MODEL_PRICES) or a row's prices may be out of date. Oldest and newest day of the longest run.
export type PriceDrift = { days: number; from: string; to: string }

export type Reconciliation = {
  rows: ReconcileRow[]
  totals: { ours: number; billed: number | null; difference: number | null; uncosted: number; noUsage: number }
  drift: PriceDrift | null
}

export const STALE_DRIFT = 0.1
export const STALE_DAYS = 3
// Below this on both sides a day is noise (a test image or two), neither drift nor agreement.
const DRIFT_FLOOR_USD = 0.05

function drifts(row: ReconcileRow): boolean | null {
  if (row.billed === null) return false
  const larger = Math.max(row.billed, row.cost_usd)
  if (larger < DRIFT_FLOOR_USD) return null
  return Math.abs(row.billed - row.cost_usd) / larger > STALE_DRIFT
}

// Rows newest first. The newest day is today, still being billed, so it never counts. A near-empty
// day is skipped without breaking a run; a day that agrees ends it.
export function priceDrift(rows: readonly ReconcileRow[]): PriceDrift | null {
  const counted = rows.slice(1).flatMap((row) => {
    const drift = drifts(row)
    return drift === null ? [] : [{ day: row.day, drift }]
  })
  let best: PriceDrift | null = null
  let runStart = -1
  for (const [index, entry] of counted.entries()) {
    if (!entry.drift) {
      runStart = -1
      continue
    }
    if (runStart < 0) runStart = index
    const days = index - runStart + 1
    if (days > (best?.days ?? 0)) best = { days, from: entry.day, to: counted[runStart]!.day }
  }
  return best !== null && best.days >= STALE_DAYS ? best : null
}

export function reconcile(ours: readonly OurDay[], billed: Readonly<Record<string, number>> | null): Reconciliation {
  // Newest day first, like every admin list.
  const rows = [...ours].reverse().map((day): ReconcileRow => {
    const value = billed === null ? null : (billed[day.day] ?? 0)
    return { ...day, billed: value, difference: value === null ? null : value - day.cost_usd }
  })
  const sum = (pick: (row: ReconcileRow) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const oursTotal = sum((row) => row.cost_usd)
  const billedTotal = billed === null ? null : sum((row) => row.billed ?? 0)
  return {
    rows,
    totals: {
      ours: oursTotal,
      billed: billedTotal,
      difference: billedTotal === null ? null : billedTotal - oursTotal,
      uncosted: sum((row) => row.uncosted),
      noUsage: sum((row) => row.no_usage),
    },
    drift: priceDrift(rows),
  }
}
