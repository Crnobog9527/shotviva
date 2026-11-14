// One submission per opening of a creation dialog. Generate queues a paid photo under a new id
// and then closes the dialog, which stays on screen for its closing motion: a second press in
// that moment (a double click; measured on the test site at 30 ms apart) queued a second photo
// and would have charged twice on a plan that runs several at once. The dialog takes the latch
// on the first press and gives it back when it is opened again.
export type SubmitLatch = { take(): boolean; reset(): void }

export function createSubmitLatch(): SubmitLatch {
  let taken = false
  return {
    take() {
      if (taken) return false
      taken = true
      return true
    },
    reset() {
      taken = false
    },
  }
}
