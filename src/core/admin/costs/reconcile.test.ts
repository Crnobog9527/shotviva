import { describe, expect, it } from 'vitest'

import { priceDrift, reconcile } from './reconcile'

const day = (date: string, cost: number, extra: Partial<{ uncosted: number; no_usage: number }> = {}) => ({
  day: date,
  cost_usd: cost,
  costed: 1,
  uncosted: extra.uncosted ?? 0,
  no_usage: extra.no_usage ?? 0,
})

describe('reconcile', () => {
  it('puts billed next to ours per day, newest first, with the difference', () => {
    const { rows, totals } = reconcile([day('2026-11-05', 1), day('2026-11-06', 0.5, { uncosted: 2, no_usage: 1 })], { '2026-11-05': 1.2 })
    expect(rows.map((r) => r.day)).toEqual(['2026-11-06', '2026-11-05'])
    expect(rows[0]).toMatchObject({ billed: 0, difference: -0.5 })
    expect(rows[1]?.billed).toBe(1.2)
    expect(rows[1]?.difference).toBeCloseTo(0.2)
    expect(totals).toMatchObject({ ours: 1.5, billed: 1.2, uncosted: 2, noUsage: 1 })
    expect(totals.difference).toBeCloseTo(-0.3)
  })

  it('shows only our side without a bill (no Admin key, or OpenAI failed)', () => {
    const { rows, totals } = reconcile([day('2026-11-06', 0.5)], null)
    expect(rows[0]).toMatchObject({ billed: null, difference: null, cost_usd: 0.5 })
    expect(totals).toMatchObject({ ours: 0.5, billed: null, difference: null })
  })
})

describe('priceDrift (stale price table hint)', () => {
  // Oldest first, as admin_daily_costs returns them; the last one is today.
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
  const drift = (ours: number[], billed: number[]) =>
    priceDrift(reconcile(ours.map((cost, i) => day(days[i]!, cost)), Object.fromEntries(billed.map((value, i) => [days[i]!, value]))).rows)

  it('hints after 3 consecutive days more than 10% apart', () => {
    expect(drift([1, 1, 1, 1, 1, 1], [1, 1.2, 1.2, 1.2, 1, 1])).toEqual({ days: 3, from: '2026-11-02', to: '2026-11-04' })
    // Recorded above billed counts too.
    expect(drift([1, 1.5, 1.5, 1.5, 1.5, 1], [1, 1, 1, 1, 1, 1])?.days).toBe(4)
  })

  it('stays quiet for 2 days, within 10%, or without a bill', () => {
    expect(drift([1, 1, 1, 1, 1, 1], [1, 1.2, 1.2, 1, 1.2, 1])).toBeNull()
    expect(drift([1, 1, 1, 1, 1, 1], [1.05, 1.09, 1.09, 1.09, 1.09, 1])).toBeNull()
    expect(priceDrift(reconcile(days.map((d) => day(d, 1)), null).rows)).toBeNull()
  })

  it('ignores today (still being billed) and near-empty days without breaking a run', () => {
    // Today is off but only two finished days are: no hint.
    expect(drift([1, 1, 1, 1, 1, 1], [1, 1, 1, 1.5, 1.5, 3])).toBeNull()
    // A day under $0.05 on both sides sits inside the run.
    expect(drift([1, 1, 0.01, 1, 1, 1], [1, 1.3, 0.02, 1.3, 1.3, 1])).toEqual({ days: 3, from: '2026-11-02', to: '2026-11-05' })
  })
})
