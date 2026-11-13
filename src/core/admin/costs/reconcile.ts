// UTC-day reconciliation of one provider's bill against our recorded cost for that provider.
export type OurDay = {
  day: string
  cost_usd: number
  // Ark's list price in yuan, as recorded per job (Ark bills in CNY); 0 for other providers.
  cost_cny?: number
  test_cost_cny?: number
  costed: number
  uncosted: number
  no_usage: number
  test_cost_usd?: number
  test_runs?: number
  has_openrouter?: boolean
  by_provider?: { provider: string; cost_usd: number; runs: number }[]
}

export type ReconcileRow = OurDay & {
  // null: no key, the bill could not be read, or the provider has not billed this day yet.
  billed: number | null
  // billed − ours; positive means the provider charged more than we recorded.
  difference: number | null
}

// Consecutive days on which ours and billed differ by more than STALE_DRIFT: the price table
// (MODEL_PRICES) or a row's prices may be out of date. Oldest and newest day of the longest run.
export type PriceDrift = { days: number; from: string; to: string }

export type Reconciliation = {
  rows: ReconcileRow[]
  totals: {
    ours: number; oursCny: number; tests: number; jobs: number
    billed: number | null; difference: number | null; uncosted: number; noUsage: number
  }
  drift: PriceDrift | null
}

export const STALE_DRIFT = 0.1
export const STALE_DAYS = 3
// Below this on both sides a day is noise (a test image or two), neither drift nor agreement.
const DRIFT_FLOOR_USD = 0.05

function drifts(row: ReconcileRow): boolean | null {
  if (row.billed === null || row.has_openrouter) return false
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

// pendingToday: the provider's bill has no entry for the current day yet (OpenRouter's Activity
// API only lists completed days), so today shows no billed amount and stays out of the totals.
export function reconcile(ours: readonly OurDay[], billed: Readonly<Record<string, number>> | null, options: { pendingToday?: boolean } = {}): Reconciliation {
  // Newest day first, like every admin list.
  const rows = [...ours].reverse().map((day, index): ReconcileRow => {
    const value = billed === null || (options.pendingToday && index === 0) ? null : (billed[day.day] ?? 0)
    return { ...day, billed: value, difference: value === null || day.has_openrouter ? null : value - day.cost_usd }
  })
  const sum = (pick: (row: ReconcileRow) => number, from = rows) => from.reduce((total, row) => total + pick(row), 0)
  const comparable = rows.filter((row) => row.billed !== null)
  const billedTotal = billed === null ? null : sum((row) => row.billed ?? 0)
  return {
    rows,
    totals: {
      ours: sum((row) => row.cost_usd),
      oursCny: sum((row) => row.cost_cny ?? 0),
      tests: sum((row) => row.test_cost_usd ?? 0),
      jobs: sum((row) => row.costed + row.uncosted + row.no_usage),
      billed: billedTotal,
      // Only over the days both sides cover.
      difference: billedTotal === null || rows.some((row) => row.has_openrouter) ? null : billedTotal - sum((row) => row.cost_usd, comparable),
      uncosted: sum((row) => row.uncosted),
      noUsage: sum((row) => row.no_usage),
    },
    drift: priceDrift(rows),
  }
}
