import { describe, expect, it } from 'vitest'

import { etaProgress, isLate, queueSpot, roundedSeconds } from './eta'
import type { TrackedJob } from './job-model'
import { estimatedProgress } from './progress'

const eta = { p50Ms: 30_000, p75Ms: 40_000 }

const job = (id: string, status: TrackedJob['status'], queuedAt: number) =>
  ({ id, status, queuedAt, startedAt: 0, templateId: 't', resolution: '1k' }) as TrackedJob

describe('etaProgress', () => {
  it('keeps the generic curve without an estimate', () => {
    expect(etaProgress(20_000, null)).toBe(estimatedProgress(20_000))
  })

  it('reaches 85% at p75 and never 100% before the job settles', () => {
    expect(etaProgress(20_000, eta)).toBeCloseTo(0.425)
    expect(etaProgress(40_000, eta)).toBeCloseTo(0.85)
    expect(etaProgress(10 * 60_000, eta)).toBeLessThanOrEqual(0.95)
    expect(etaProgress(60_000, eta)).toBeGreaterThan(0.85)
  })
})

describe('isLate', () => {
  it('waits for half again past p75 and at least 20 s past the usual time', () => {
    expect(isLate(59_000, eta)).toBe(false)
    expect(isLate(61_000, eta)).toBe(true)
    // A quick model is not slow a few seconds over: 1.5 × 12 s = 18 s, but p50 + 20 s = 30 s.
    expect(isLate(20_000, { p50Ms: 10_000, p75Ms: 12_000 })).toBe(false)
    expect(isLate(10 * 60_000, null)).toBe(false)
  })
})

describe('roundedSeconds', () => {
  it('shows no false precision', () => {
    expect(roundedSeconds(3_000)).toBe(10)
    expect(roundedSeconds(27_400)).toBe(25)
    expect(roundedSeconds(28_000)).toBe(30)
    expect(roundedSeconds(74_000)).toBe(70)
  })
})

describe('queueSpot', () => {
  it('counts the photos ahead and the rounds until its turn', () => {
    const jobs = [job('a', 'running', 1), job('b', 'queued', 2), job('c', 'queued', 3), job('d', 'queued', 4)]
    expect(queueSpot(jobs, jobs[1]!, 1, eta)).toEqual({ ahead: 1, waitMs: 30_000 })
    expect(queueSpot(jobs, jobs[3]!, 1, eta)).toEqual({ ahead: 3, waitMs: 90_000 })
    expect(queueSpot(jobs, jobs[3]!, 3, null)).toEqual({ ahead: 3, waitMs: null })
    expect(queueSpot(jobs, jobs[0]!, 1, eta)).toBeNull()
  })
})
