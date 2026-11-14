import { rate } from '../analytics/values'
import type { Counts } from './funnel'

// The four steps of the funnel with the conversion from the step before, and the step where the
// most people were lost: the lowest conversion (ties go to the earlier step). A step without a
// number (no PostHog) is skipped, and the next step is compared with the last one that has one.

export const STEPS = ['visitors', 'signups', 'imaged', 'paid'] as const
export type StepKey = (typeof STEPS)[number]
export type Step = { key: StepKey; count: number | null; conversion: number | null }
export type Drop = { from: StepKey; to: StepKey; conversion: number; lost: number }

export function stepsOf(counts: Counts): Step[] {
  let previous: number | null = null
  return STEPS.map((key) => {
    const count = counts[key]
    // Visitors under sign-ups (an ad blocker, a phone sign-up without a page view) has no
    // meaningful conversion, so none is shown rather than a figure above 100%.
    const conversion = count === null || previous === null || count > previous ? null : rate(count, previous)
    if (count !== null) previous = count
    return { key, count, conversion }
  })
}

export function biggestDrop(steps: readonly Step[]): Drop | null {
  let best: Drop | null = null
  let previous: Step | null = null
  for (const step of steps) {
    if (step.count === null) continue
    if (previous?.count != null && step.conversion !== null && (!best || step.conversion < best.conversion)) {
      best = { from: previous.key, to: step.key, conversion: step.conversion, lost: previous.count - step.count }
    }
    previous = step
  }
  return best && best.lost > 0 ? best : null
}
