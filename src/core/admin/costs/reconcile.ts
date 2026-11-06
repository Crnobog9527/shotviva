// /admin/costs rows (ARCHITECTURE §10.0): per UTC day, what OpenAI billed next to what our jobs
// add up to. Pure, so the page's numbers are tested without either side.

export type OurDay = { day: string; cost_usd: number; costed: number; uncosted: number; no_usage: number }

export type ReconcileRow = OurDay & {
  // null: no Admin key, or OpenAI could not be read.
  billed: number | null
  // billed − ours; positive means OpenAI charged more than we recorded.
  difference: number | null
}

export type Reconciliation = {
  rows: ReconcileRow[]
  totals: { ours: number; billed: number | null; difference: number | null; uncosted: number; noUsage: number }
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
  }
}
