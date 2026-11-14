// The wait screen's numbers from a list of real durations (ms). Pure, so the client-side wording
// and the server read agree on one shape. Fewer than MIN_SAMPLES: null, no number is shown.
export type DurationEstimate = { p50Ms: number; p75Ms: number; samples: number }

export const MIN_SAMPLES = 5

// Linear interpolation between the closest ranks (Postgres percentile_cont).
function percentile(sorted: number[], fraction: number): number {
  const rank = (sorted.length - 1) * fraction
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  const lowValue = sorted[low] ?? 0
  return lowValue + ((sorted[high] ?? lowValue) - lowValue) * (rank - low)
}

export function summarizeDurations(values: number[]): DurationEstimate | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (sorted.length < MIN_SAMPLES) return null
  return { p50Ms: Math.round(percentile(sorted, 0.5)), p75Ms: Math.round(percentile(sorted, 0.75)), samples: sorted.length }
}
