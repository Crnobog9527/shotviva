import { AMPLITUDE, CELL_CHIPS, CHIP, encodePayload, PATTERN, TILE_CELLS } from './tracking-code'

// Writes the tracking mark (tracking-code.ts) into an RGBA picture, in place: each chip's three
// colour channels move by the same small amount, up or down by the chip's sign. How much follows
// the chip's own texture (visual masking): ±MIN_AMPLITUDE on a flat plate or wall, where a
// pattern would show, up to ±AMPLITUDE in busy texture, where it hides. Each channel is first
// squeezed into [AMPLITUDE, 255 − AMPLITUDE] (blacks lifted and whites lowered by ~1.5%), so pure
// white and black areas still carry the whole mark instead of half of it. Pixels a cut-out leaves
// fully see-through are skipped. A few ms at 1080 px, plain JavaScript, so it runs on Vercel.

const MIN_AMPLITUDE = 1.5
// Amplitude added per unit of the chip's mean neighbour difference (in grey levels).
const MASKING = 0.35
const SQUEEZE = (255 - 2 * AMPLITUDE) / 255

// ±1 for every chip of one tile, computed once: rows of TILE_CELLS × CELL_CHIPS.
function tileSigns(jobId: string): Int8Array {
  const bits = encodePayload(jobId)
  const span = TILE_CELLS * CELL_CHIPS
  const signs = new Int8Array(span * span)
  for (let cy = 0; cy < span; cy++) {
    for (let cx = 0; cx < span; cx++) {
      const bit = bits[Math.floor(cy / CELL_CHIPS) * TILE_CELLS + Math.floor(cx / CELL_CHIPS)]!
      signs[cy * span + cx] = (bit ? 1 : -1) * PATTERN[(cy % CELL_CHIPS) * CELL_CHIPS + (cx % CELL_CHIPS)]!
    }
  }
  return signs
}

const lumaAt = (rgba: Uint8Array, i: number) => 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!

// The amplitude of the chip whose top-left pixel is (x0, y0), from its mean neighbour difference.
function chipAmplitude(rgba: Uint8Array, width: number, height: number, x0: number, y0: number): number {
  let sum = 0
  let count = 0
  for (let y = y0; y < Math.min(height - 1, y0 + CHIP); y++) {
    for (let x = x0; x < Math.min(width - 1, x0 + CHIP); x++) {
      const i = (y * width + x) * 4
      const here = lumaAt(rgba, i)
      sum += Math.abs(here - lumaAt(rgba, i + 4)) + Math.abs(here - lumaAt(rgba, i + width * 4))
      count += 2
    }
  }
  const activity = count > 0 ? sum / count : 0
  return Math.min(AMPLITUDE, MIN_AMPLITUDE + activity * MASKING)
}

export function embedTrackingMark(rgba: Uint8Array, width: number, height: number, jobId: string): void {
  const signs = tileSigns(jobId)
  const span = TILE_CELLS * CELL_CHIPS
  for (let y0 = 0; y0 < height; y0 += CHIP) {
    const row = (Math.floor(y0 / CHIP) % span) * span
    for (let x0 = 0; x0 < width; x0 += CHIP) {
      const delta = signs[row + (Math.floor(x0 / CHIP) % span)]! * chipAmplitude(rgba, width, height, x0, y0)
      shiftChip(rgba, width, height, x0, y0, delta)
    }
  }
}

function shiftChip(rgba: Uint8Array, width: number, height: number, x0: number, y0: number, delta: number) {
  for (let y = y0; y < Math.min(height, y0 + CHIP); y++) {
    for (let x = x0; x < Math.min(width, x0 + CHIP); x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3] === 0) continue
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(AMPLITUDE + rgba[i + c]! * SQUEEZE + delta)
    }
  }
}
