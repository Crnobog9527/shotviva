// The invisible tracking mark's code (Owner 2026-11-22): what is written into a free copy and how
// it is laid out. Shared by the writer (tracking-mark.ts) and the admin decoder (tracking-decode.ts).
//
// Layout, in pixels of the served copy:
//   chip  CHIP × CHIP pixels shifted by the same amount (at most ±AMPLITUDE) in luminance;
//   cell  CELL_CHIPS × CELL_CHIPS chips carrying one bit: the fixed ±1 chip pattern PATTERN,
//         times +1 or −1 for the bit;
//   tile  TILE_CELLS × TILE_CELLS cells holding the whole 64-bit payload once; repeated across
//         the picture, so any piece of it holding a tile or two still has every bit, many times.
// Payload: the first 48 bits of the work's uuid (12 hex digits; the decoder finds the work by
// that prefix) and a CRC-16 over them, XORed with a fixed key so the tile never reads as flat.

export const CHIP = 4
export const CELL_CHIPS = 4
export const TILE_CELLS = 8
export const CELL = CHIP * CELL_CHIPS
export const TILE = CELL * TILE_CELLS
export const AMPLITUDE = 4
export const PAYLOAD_BITS = TILE_CELLS * TILE_CELLS
const ID_BITS = 48

// A small seeded generator, so the pattern and key are the same on every server, forever.
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ±1 per chip of a cell, half of each so a cell adds nothing to the average brightness.
export const PATTERN: readonly number[] = (() => {
  const random = mulberry32(0x5107_7a1a)
  const signs: number[] = Array.from({ length: CELL_CHIPS * CELL_CHIPS }, (_, i) => (i % 2 === 0 ? 1 : -1))
  for (let i = signs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[signs[i], signs[j]] = [signs[j]!, signs[i]!]
  }
  return signs
})()

const KEY: readonly number[] = (() => {
  const random = mulberry32(0x0c0f_fee5)
  return Array.from({ length: PAYLOAD_BITS }, () => (random() < 0.5 ? 0 : 1))
})()

// CRC-16/CCITT-FALSE over the id bits, most significant first.
function crc16(bits: readonly number[]): number {
  let crc = 0xffff
  for (const bit of bits) {
    const top = ((crc >> 15) & 1) ^ bit
    crc = (crc << 1) & 0xffff
    if (top) crc ^= 0x1021
  }
  return crc
}

const toBits = (value: number, count: number) => Array.from({ length: count }, (_, i) => Math.floor(value / 2 ** (count - 1 - i)) % 2)

const ID_PREFIX = /^[0-9a-f]{8}-?[0-9a-f]{4}/i

// The 64 bits written for a work (cell order: row by row through the tile).
export function encodePayload(jobId: string): number[] {
  const match = ID_PREFIX.exec(jobId)
  if (!match) throw new Error('tracking mark: not a uuid')
  const hex = match[0].replace('-', '').toLowerCase()
  const id = toBits(parseInt(hex.slice(0, 6), 16), 24).concat(toBits(parseInt(hex.slice(6), 16), 24))
  return id.concat(toBits(crc16(id), 16)).map((bit, i) => bit ^ KEY[i]!)
}

// The id prefix (12 hex digits) when the bits read back with a matching CRC, else null.
export function decodePayload(bits: readonly number[]): string | null {
  if (bits.length !== PAYLOAD_BITS) return null
  const plain = bits.map((bit, i) => bit ^ KEY[i]!)
  const id = plain.slice(0, ID_BITS)
  const crc = plain.slice(ID_BITS).reduce((sum, bit) => sum * 2 + bit, 0)
  if (crc16(id) !== crc) return null
  return id
    .reduce((hex, _, i) => (i % 4 === 0 ? hex + ((id[i]! << 3) | (id[i + 1]! << 2) | (id[i + 2]! << 1) | id[i + 3]!).toString(16) : hex), '')
}

// The uuid range a decoded prefix covers: the decoder reads the works in it by primary key.
export function prefixRange(prefix: string): { from: string; to: string } {
  const head = `${prefix.slice(0, 8)}-${prefix.slice(8, 12)}`
  return { from: `${head}-0000-0000-000000000000`, to: `${head}-ffff-ffff-ffffffffffff` }
}
