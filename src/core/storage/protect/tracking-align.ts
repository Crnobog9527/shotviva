import { CELL_CHIPS, CHIP, decodePayload, PATTERN, TILE_CELLS } from './tracking-code'

// Reading the tracking mark from a grey picture already brought back to the scale it was written
// at (tracking-decode.ts finds that scale). The chip grid's offset is unknown after a crop, so all
// CHIP × CHIP pixel phases and CELL_CHIPS × CELL_CHIPS chip offsets are tried; the right one makes
// the per-cell correlations with PATTERN large (their energy against what noise alone would give,
// `strength`, is about 1 without a mark). The cells are then folded onto one tile and the 64
// possible tile starts are tried against the payload's CRC.

export type Grey = { data: Uint8Array | Float32Array; width: number; height: number }
export type Alignment = { strength: number; cells: Float32Array; columns: number; rows: number }

// Mean of each CHIP × CHIP block starting at (px, py), minus the mean of its 3 × 3 neighbourhood:
// what is left is mostly the mark (picture content is smooth at this scale) plus noise.
function chipResidual(grey: Grey, px: number, py: number): Grey & { data: Float32Array } {
  const width = Math.floor((grey.width - px) / CHIP)
  const height = Math.floor((grey.height - py) / CHIP)
  const chips = new Float32Array(width * height)
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      let sum = 0
      for (let v = 0; v < CHIP; v++) {
        const row = (py + cy * CHIP + v) * grey.width + px + cx * CHIP
        for (let u = 0; u < CHIP; u++) sum += grey.data[row + u]!
      }
      chips[cy * width + cx] = sum / (CHIP * CHIP)
    }
  }
  return { data: highPass(chips, width, height), width, height }
}

function highPass(chips: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(chips.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          sum += chips[ny * width + nx]!
          count++
        }
      }
      out[y * width + x] = chips[y * width + x]! - sum / count
    }
  }
  return out
}

// Residuals are clipped: an edge in the picture (a plate's rim, a line of text) would otherwise
// outweigh dozens of chips of mark, which is a few grey levels at most.
const CLIP = 6
const clip = (value: number) => (value > CLIP ? CLIP : value < -CLIP ? -CLIP : value)

// The correlation of every whole cell starting at chip (ox, oy) with PATTERN, and their energy
// against the residual's own (≈ 1 for noise).
function cellsAt(residual: Grey & { data: Float32Array }, ox: number, oy: number): Alignment {
  const columns = Math.floor((residual.width - ox) / CELL_CHIPS)
  const rows = Math.floor((residual.height - oy) / CELL_CHIPS)
  const cells = new Float32Array(Math.max(0, columns * rows))
  let energy = 0
  let noise = 0
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      let c = 0
      for (let v = 0; v < CELL_CHIPS; v++) {
        const row = (oy + j * CELL_CHIPS + v) * residual.width + ox + i * CELL_CHIPS
        for (let u = 0; u < CELL_CHIPS; u++) {
          const r = clip(residual.data[row + u]!)
          c += r * PATTERN[v * CELL_CHIPS + u]!
          noise += r * r
        }
      }
      cells[j * columns + i] = c
      energy += c * c
    }
  }
  return { strength: noise > 0 ? energy / noise : 0, cells, columns, rows }
}

// The phase and offset are searched on a window in the middle (all CHIP² × CELL_CHIPS²
// combinations), then the cells of the whole piece are read at the winner.
const PROBE = 256

function middle(grey: Grey, size: number): Grey & { left: number; top: number } {
  const width = Math.min(size, grey.width)
  const height = Math.min(size, grey.height)
  const left = Math.floor((grey.width - width) / 2)
  const top = Math.floor((grey.height - height) / 2)
  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = grey.data[(top + y) * grey.width + left + x]!
  }
  return { data, width, height, left, top }
}

// Where the cells start, as a pixel offset within one cell (0 … CELL − 1) on each axis.
function bestOffset(probe: Grey): { x: number; y: number } | null {
  let best: { x: number; y: number; strength: number } | null = null
  for (let py = 0; py < CHIP; py++) {
    for (let px = 0; px < CHIP; px++) {
      const residual = chipResidual(probe, px, py)
      for (let oy = 0; oy < CELL_CHIPS; oy++) {
        for (let ox = 0; ox < CELL_CHIPS; ox++) {
          const found = cellsAt(residual, ox, oy)
          if (found.cells.length > 0 && (!best || found.strength > best.strength)) best = { x: px + ox * CHIP, y: py + oy * CHIP, strength: found.strength }
        }
      }
    }
  }
  return best
}

export function align(grey: Grey): Alignment | null {
  const probe = middle(grey, PROBE)
  const offset = bestOffset(probe)
  if (!offset) return null
  const cell = CHIP * CELL_CHIPS
  const x = (probe.left + offset.x) % cell
  const y = (probe.top + offset.y) % cell
  const found = cellsAt(chipResidual(grey, x % CHIP, y % CHIP), Math.floor(x / CHIP), Math.floor(y / CHIP))
  return found.cells.length > 0 ? found : null
}

// Folds the cells onto one tile (summing every repeat) and tries each of the 64 tile starts.
// `agreement`: the share of single cells whose sign matches the folded bit (0.5 = chance).
export function readPayload(found: Alignment): { prefix: string; agreement: number } | null {
  const folded = new Float32Array(TILE_CELLS * TILE_CELLS)
  for (let j = 0; j < found.rows; j++) {
    for (let i = 0; i < found.columns; i++) folded[(j % TILE_CELLS) * TILE_CELLS + (i % TILE_CELLS)]! += found.cells[j * found.columns + i]!
  }
  for (let sy = 0; sy < TILE_CELLS; sy++) {
    for (let sx = 0; sx < TILE_CELLS; sx++) {
      const bits = Array.from({ length: TILE_CELLS * TILE_CELLS }, (_, k) => {
        const r = (Math.floor(k / TILE_CELLS) + sy) % TILE_CELLS
        const q = ((k % TILE_CELLS) + sx) % TILE_CELLS
        return folded[r * TILE_CELLS + q]! > 0 ? 1 : 0
      })
      const prefix = decodePayload(bits)
      if (prefix) return { prefix, agreement: agreementOf(found, folded) }
    }
  }
  return null
}

function agreementOf(found: Alignment, folded: Float32Array): number {
  let same = 0
  for (let j = 0; j < found.rows; j++) {
    for (let i = 0; i < found.columns; i++) {
      const tile = folded[(j % TILE_CELLS) * TILE_CELLS + (i % TILE_CELLS)]!
      if (tile * found.cells[j * found.columns + i]! > 0) same++
    }
  }
  return found.cells.length > 0 ? same / found.cells.length : 0
}
