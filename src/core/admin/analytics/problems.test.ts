import { describe, expect, it } from 'vitest'

import { failuresQuery, loadProblems, vitalsQuery } from './problems'
import { fakeRun, WEEK } from './test-samples'

describe('体验问题', () => {
  it('reads upload_error reasons and failed generate codes against all attempts', () => {
    const { query } = failuresQuery(WEEK)
    expect(query).toContain("event IN ('upload', 'upload_error', 'generate')")
    expect(query).toContain("properties.status = 'failed'")
  })

  it('takes the 75th percentile of each Web Vital per page', () => {
    const { query } = vitalsQuery(WEEK)
    expect(query).toContain("event = '$web_vitals'")
    for (const metric of ['LCP', 'INP', 'CLS', 'FCP']) expect(query).toContain(`quantile(0.75)(toFloat(properties.$web_vitals_${metric}_value))`)
  })

  it('reports failures with rates and reasons, and pages slowest first (recorded answers)', async () => {
    const problems = await loadProblems(fakeRun(), WEEK)
    expect(problems.uploads).toEqual({
      attempts: 997,
      failed: 47,
      failedPrev: 37,
      rate: 47 / 997,
      ratePrev: 37 / 937,
      reasons: [
        { reason: 'transfer_failed', count: 31, previous: 22 },
        { reason: 'too_large', count: 12, previous: 15 },
        { reason: 'unsupported', count: 4, previous: 0 },
      ],
    })
    expect(problems.images).toMatchObject({ failed: 25, rate: 25 / 1225, reasons: [{ reason: 'PROVIDER_TIMEOUT' }, { reason: 'CONTENT_REJECTED' }] })
    expect(problems.vitals.map((row) => row.path)).toEqual(['/pricing', '/zh', '/'])
    expect(problems.vitals[1]?.inp).toBeNull()
  })
})
