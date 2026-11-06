import { describe, expect, it } from 'vitest'

import { reconcile } from './reconcile'

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
