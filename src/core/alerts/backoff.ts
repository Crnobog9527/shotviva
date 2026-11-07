// When Feishu keeps failing (down, wrong secret), this instance stops trying for a while instead
// of retrying on every error or ticket: 1 minute after the first failure, doubling to 30 minutes,
// reset by the next success. Money alerts ignore it (notify.ts): they are rare and matter most.

const FIRST_MS = 60_000
const MAX_MS = 30 * 60_000

export type Backoff = {
  paused(nowMs: number): boolean
  failed(nowMs: number): void
  succeeded(): void
}

export function createBackoff(): Backoff {
  const state = { until: 0, delay: 0 }
  return {
    paused: (nowMs) => nowMs < state.until,
    failed(nowMs) {
      state.delay = state.delay === 0 ? FIRST_MS : Math.min(state.delay * 2, MAX_MS)
      state.until = nowMs + state.delay
    },
    succeeded() {
      state.delay = 0
      state.until = 0
    },
  }
}
