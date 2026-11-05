// Generation is one synchronous provider call (ARCHITECTURE §4): the server reports no
// progress, so the bar is an honest estimate from elapsed time against the usual 20–40 s.
// It approaches but never reaches 100% until the job really settles.
const TIME_CONSTANT_MS = 18_000
const CEILING = 0.95

export function estimatedProgress(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return Math.min(CEILING, 1 - Math.exp(-elapsedMs / TIME_CONSTANT_MS))
}

export const percent = (fraction: number) => Math.round(fraction * 100)
