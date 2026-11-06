import type { PhotoSeconds, SecondsRange } from '@/core/config'
import type { Resolution } from '@/core/templates/output-options'

// One span for a set of photos: one quality → its own range; mixed qualities → from the
// fastest low to the slowest high ("Usually 20–60 seconds each").
export function secondsFor(table: PhotoSeconds, resolutions: readonly Resolution[]): SecondsRange {
  const ranges = [...new Set(resolutions.length ? resolutions : (['1k'] as const))].map((resolution) => table[resolution])
  return { low: Math.min(...ranges.map((range) => range.low)), high: Math.max(...ranges.map((range) => range.high)) }
}
