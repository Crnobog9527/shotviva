import { describe, expect, it } from 'vitest'

import { costSummary, jobCostCell, legacyEstimate, modelCosts } from './cost'

const UNIT = { '1k': 0.05, '2k': 0.1 }

const row = (overrides: Partial<Parameters<typeof modelCosts>[0][number]> = {}) => ({
  provider: 'env',
  model: 'gpt-image-2.6-sunburst',
  resolution: '2k',
  jobs: 10,
  succeeded: 8,
  cost_usd: 0,
  uncosted: 0,
  legacy: 0,
  ...overrides,
})

describe('admin cost figures (T33)', () => {
  it('uses real cost and estimates only pre-T33 successes', () => {
    const { rows, total } = modelCosts([row({ cost_usd: 0.5, legacy: 3 }), row({ resolution: '8k', cost_usd: 0.2, legacy: 1 })], UNIT)
    expect(rows[0]?.real).toBe(0.5)
    expect(rows[0]?.estimated).toBeCloseTo(0.3)
    expect(rows[0]?.perImage).toBeCloseTo(0.1)
    // An unknown resolution has no constant: nothing is estimated for it.
    expect(rows[1]).toMatchObject({ real: 0.2, estimated: 0 })
    expect(total.real).toBeCloseTo(0.7)
    expect(total.total).toBeCloseTo(1)
    expect(total.perImage).toBeCloseTo(1 / 16)
  })

  it('has no per-image cost without a succeeded image', () => {
    expect(costSummary(0.2, 0, 0)).toEqual({ real: 0.2, estimated: 0, total: 0.2, perImage: null })
  })

  it('estimates legacy jobs given per resolution', () => {
    expect(legacyEstimate({ '1k': 2, '2k': 1, '9k': 5 }, UNIT)).toBeCloseTo(0.2)
    expect(legacyEstimate({}, UNIT)).toBe(0)
  })

  it('labels each job: real, 无法计算, estimate for an old success, else nothing', () => {
    const job = { costUsd: null, hasUsage: false, status: 'succeeded', resolution: '1k' }
    expect(jobCostCell({ ...job, costUsd: 0.12, hasUsage: true }, UNIT)).toEqual({ kind: 'real', usd: 0.12 })
    expect(jobCostCell({ ...job, hasUsage: true }, UNIT)).toEqual({ kind: 'uncosted' })
    expect(jobCostCell(job, UNIT)).toEqual({ kind: 'estimate', usd: 0.05 })
    expect(jobCostCell({ ...job, status: 'failed' }, UNIT)).toEqual({ kind: 'none' })
    expect(jobCostCell({ ...job, resolution: '8k' }, UNIT)).toEqual({ kind: 'none' })
  })
})
