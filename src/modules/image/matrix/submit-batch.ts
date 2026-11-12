import type { SubmitLatch } from '../workspace/submit-latch'

// One Generate per batch (#515's latch, here for Batch create): the page only greys its button
// once the preflight is under way, so a double click in the same frame would send two preflights
// and queue the batch twice. The first press takes the latch; a refusal (or nothing to send)
// gives it back so the user can fix and press again; a started batch keeps it until the form
// comes back for a new batch (`latch.reset()` there).
export function submitBatch<E>(latch: SubmitLatch, start: () => Promise<{ error: E } | { started: boolean }>, done: { refused(error: E): void; started(): void }): boolean {
  if (!latch.take()) return false
  void start().then((outcome) => {
    if ('error' in outcome) {
      latch.reset()
      done.refused(outcome.error)
    } else if (outcome.started) done.started()
    else latch.reset()
  })
  return true
}
