// Pure parts of scripts/qa/test-clock.ts, kept apart so they are unit-tested without Stripe.

// Must match QA_CLOCK_PREFIX in core/billing/stripe/qa-test-clock.ts (test-clock.test.ts checks).
export const QA_CLOCK_NAME_PREFIX = 'shotviva-qa'

export type ClockArgs = { command: 'list' } | { command: 'advance' | 'delete'; clock: string }

export function parseClockArgs(argv: readonly string[]): ClockArgs {
  const [command, clock, ...rest] = argv
  if (command === 'list' && clock === undefined) return { command }
  if ((command === 'advance' || command === 'delete') && clock && /^clock_[A-Za-z0-9]+$/.test(clock) && rest.length === 0) {
    return { command, clock }
  }
  throw new Error('usage: pnpm qa:clock list | advance <clock_id> | delete <clock_id>')
}

// One hour past the latest period end, so Stripe has rolled every subscription on the clock into
// its next period. Refuses when nothing is due: advancing without a subscription bills nothing.
export function nextFrozenTime(now: number, periodEnds: readonly number[]): number {
  const due = periodEnds.filter((end) => end > 0)
  if (due.length === 0) throw new Error('no subscription on this clock yet; check out first')
  return Math.max(now, ...due) + 3600
}
