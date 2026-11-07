import { describe, expect, it, vi } from 'vitest'

import { isSpike, readFailureStats, spikeAlert } from './failure-spike'

describe('failure spike rule: ≥ 5 failed and ≥ 30% in the last 60 minutes', () => {
  it('needs both the count and the rate', () => {
    expect(isSpike({ failed: 5, total: 16 })).toBe(true) // 31%
    expect(isSpike({ failed: 5, total: 17 })).toBe(false) // 29%
    expect(isSpike({ failed: 4, total: 4 })).toBe(false) // 100%, but only 4
    expect(isSpike({ failed: 0, total: 0 })).toBe(false)
  })

  it('reads two counts (no rows) over the last hour, declined photos not counted as failed', async () => {
    const calls: string[][] = []
    const query = (counts: number) => {
      const steps: string[] = []
      calls.push(steps)
      const chain = {
        gte: (column: string, value: string) => (steps.push(`gte ${column} ${value}`), chain),
        neq: (column: string, value: string) => (steps.push(`neq ${column} ${value}`), chain),
        eq: (column: string, value: string) => (steps.push(`eq ${column} ${value}`), chain),
        or: (filter: string) => (steps.push(`or ${filter}`), chain),
        limit: (n: number) => (steps.push(`limit ${n}`), chain),
        abortSignal: () => Promise.resolve({ count: counts, error: null }),
      }
      return chain
    }
    const counts = [20, 7]
    const select = vi.fn(() => query(counts.shift() ?? 0))
    const db = { from: () => ({ select }) }
    const stats = await readFailureStats(db as never, Date.parse('2026-11-08T10:30:00Z'))
    expect(stats).toEqual({ failed: 7, total: 20 })
    expect(select).toHaveBeenCalledWith('id', { count: 'exact' })
    expect(calls[0]).toEqual(['gte created_at 2026-11-08T09:30:00.000Z', 'neq status running', 'limit 1'])
    expect(calls[1]).toEqual(['gte created_at 2026-11-08T09:30:00.000Z', 'eq status failed', 'or error_code.is.null,error_code.neq.CONTENT_REJECTED', 'limit 1'])
  })

  it('builds the alert', () => {
    expect(spikeAlert({ failed: 6, total: 10 })).toEqual({ kind: 'generation_spike', failed: 6, total: 10, windowMinutes: 60 })
  })
})
