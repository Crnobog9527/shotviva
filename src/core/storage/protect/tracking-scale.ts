import { TILE } from './tracking-code'
import type { Grey } from './tracking-align'

// After a resize the tile repeats every TILE × scale pixels instead of TILE. The picture's fine
// detail (itself minus a blur) is compared with itself shifted by every lag in a plausible range;
// the mark makes it match at the tile period and at each multiple of it. Each scale is scored by
// summing the match at all of its multiples (a comb), which both picks the period out of picture
// content and pins it down to a fraction of a percent. Done per axis, so a stretched picture
// still reads. Returns the best few scales, best first.

const MIN_SCALE = 0.3
const MAX_SCALE = 2.6
const STEP = 1.0025
const GUESSES = 3

// Correlation of the detail with itself `lag` pixels along x (or y), over every second line.
function correlationAt(detail: Grey & { data: Float32Array }, lag: number, axis: 'x' | 'y'): number {
  const { width, height, data } = detail
  let sum = 0
  let count = 0
  if (axis === 'x') {
    for (let y = 0; y < height; y += 2) {
      const row = y * width
      for (let x = 0; x + lag < width; x++) sum += data[row + x]! * data[row + x + lag]!
      count += Math.max(0, width - lag)
    }
  } else {
    for (let y = 0; y + lag < height; y++) {
      const row = y * width
      const next = (y + lag) * width
      for (let x = 0; x < width; x += 2) sum += data[row + x]! * data[next + x]!
      count += Math.ceil(width / 2)
    }
  }
  return count > 0 ? sum / count : 0
}

// The match at each lag above the mean of its neighbourhood, so the slow fall-off of picture
// content does not count; indexed by lag, read between lags by straight-line interpolation.
function contrasts(detail: Grey & { data: Float32Array }, axis: 'x' | 'y', to: number): Float32Array {
  const raw = new Float32Array(to + 5)
  for (let lag = 1; lag < raw.length; lag++) raw[lag] = correlationAt(detail, lag, axis)
  const out = new Float32Array(to + 1)
  for (let lag = 5; lag <= to; lag++) out[lag] = raw[lag]! - (raw[lag - 4]! + raw[lag - 3]! + raw[lag + 3]! + raw[lag + 4]!) / 4
  return out
}

function at(values: Float32Array, lag: number): number {
  const low = Math.floor(lag)
  if (low < 5 || low + 1 >= values.length) return 0
  return values[low]! + (values[low + 1]! - values[low]!) * (lag - low)
}

// Each scale's comb score; a scale needs at least two of its multiples inside the range.
function combScores(values: Float32Array): { scale: number; score: number }[] {
  const scores: { scale: number; score: number }[] = []
  for (let scale = MIN_SCALE; scale <= MAX_SCALE; scale *= STEP) {
    const period = TILE * scale
    const teeth = Math.floor((values.length - 2) / period)
    if (teeth < 2) continue
    let score = 0
    for (let k = 1; k <= teeth; k++) score += at(values, k * period)
    scores.push({ scale, score: score / Math.sqrt(teeth) })
  }
  return scores
}

export function scaleGuesses(detail: Grey & { data: Float32Array }, axis: 'x' | 'y'): number[] {
  const extent = axis === 'x' ? detail.width : detail.height
  const values = contrasts(detail, axis, Math.floor(extent * 0.75))
  const scores = combScores(values)
  const peaks = scores.filter((s, i) => i > 0 && i < scores.length - 1 && s.score >= scores[i - 1]!.score && s.score >= scores[i + 1]!.score)
  return peaks
    .sort((a, b) => b.score - a.score)
    .slice(0, GUESSES)
    .map((peak) => peak.scale)
}
