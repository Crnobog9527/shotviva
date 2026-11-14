import { describe, expect, it } from 'vitest'

import { MIN_SAMPLES, summarizeDurations } from './duration-summary'

describe('summarizeDurations', () => {
  it('gives no estimate below the minimum number of real jobs', () => {
    expect(summarizeDurations(Array(MIN_SAMPLES - 1).fill(30_000))).toBeNull()
  })

  it('takes p50 and p75 like percentile_cont, ignoring nonsense values', () => {
    expect(summarizeDurations([10_000, 20_000, 30_000, 40_000, 50_000, -5, Number.NaN])).toEqual({ p50Ms: 30_000, p75Ms: 40_000, samples: 5 })
    expect(summarizeDurations([40_000, 10_000, 30_000, 20_000, 50_000, 60_000])).toEqual({ p50Ms: 35_000, p75Ms: 47_500, samples: 6 })
  })
})
