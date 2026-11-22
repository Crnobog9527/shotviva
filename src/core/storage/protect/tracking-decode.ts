import 'server-only'

import sharp from 'sharp'

import { align, readPayload, type Grey } from './tracking-align'
import { scaleGuesses } from './tracking-scale'

// Reads the tracking mark back (admin tool, ARCHITECTURE §6.2). Best effort: survives JPEG
// re-saves, resizing (found from the tile's period, tracking-scale.ts) and cropping that leaves a
// couple of tiles (≈ 260 px of the served copy) in one piece. Not rotations, flips, heavy blur,
// screenshots of a screenshot at a tiny size, or a picture redrawn by an AI model.

// The piece of the picture searched, in pixels at the written scale: enough tiles to fold, small
// enough to keep a full search under a couple of seconds.
const REGION = 640
// Around each guessed scale: ±0.9% in 0.3% steps (the period search is good to a few tenths of a percent; a
// 0.5% error already blurs the grid).
const FINE_STEPS = Array.from({ length: 7 }, (_, i) => (i - 3) * 0.003)
// Above this the cells line up far better than noise would; below it nothing is reported.
const MIN_STRENGTH = 1.3

export type TrackingRead = { prefix: string; strength: number; agreement: number; scale: { x: number; y: number } }

async function greyOf(image: Uint8Array): Promise<Grey & { data: Uint8Array }> {
  const { data, info } = await sharp(image).flatten({ background: '#ffffff' }).greyscale().toColourspace('b-w').raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height }
}

// The centre of the picture brought back to the written scale (sx, sy = received ÷ written).
async function rescaled(grey: Grey & { data: Uint8Array }, sx: number, sy: number): Promise<Grey> {
  const width = Math.min(grey.width, Math.round(REGION * sx))
  const height = Math.min(grey.height, Math.round(REGION * sy))
  const left = Math.floor((grey.width - width) / 2)
  const top = Math.floor((grey.height - height) / 2)
  const out = await sharp(Buffer.from(grey.data.buffer, grey.data.byteOffset, grey.data.length), { raw: { width: grey.width, height: grey.height, channels: 1 } })
    .extract({ left, top, width, height })
    .resize(Math.max(16, Math.round(width / sx)), Math.max(16, Math.round(height / sy)), { fit: 'fill', kernel: 'cubic' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(out.data.buffer, out.data.byteOffset, out.data.length), width: out.info.width, height: out.info.height }
}

async function tryScale(grey: Grey & { data: Uint8Array }, sx: number, sy: number): Promise<TrackingRead | null> {
  const found = align(await rescaled(grey, sx, sy))
  if (!found || found.strength < MIN_STRENGTH) return null
  const payload = readPayload(found)
  return payload ? { ...payload, strength: found.strength, scale: { x: sx, y: sy } } : null
}

// The picture's fine detail (itself minus a blur), around its centre, for the period search.
async function detailOf(grey: Grey & { data: Uint8Array }): Promise<Grey & { data: Float32Array }> {
  const width = Math.min(grey.width, 640)
  const height = Math.min(grey.height, 640)
  const piece = sharp(Buffer.from(grey.data.buffer, grey.data.byteOffset, grey.data.length), { raw: { width: grey.width, height: grey.height, channels: 1 } }).extract({
    left: Math.floor((grey.width - width) / 2),
    top: Math.floor((grey.height - height) / 2),
    width,
    height,
  })
  const sharpRaw = await piece.clone().toColourspace('b-w').raw().toBuffer()
  const blurred = await piece.clone().blur(3).toColourspace('b-w').raw().toBuffer()
  const data = new Float32Array(width * height)
  // Clipped like the cells (tracking-align.ts): edges must not drown the faint periodic mark.
  for (let i = 0; i < data.length; i++) data[i] = Math.max(-6, Math.min(6, sharpRaw[i]! - blurred[i]!))
  return { data, width, height }
}

// The scales to try, in order: unchanged first (most copies are saved as served), then every
// guess from either axis as a uniform resize (one axis is often thrown off by the picture's own
// texture), then pairings of an x and a y guess that differ (a stretched picture), each with the
// fine steps around it.
type Scale = { x: number; y: number }
const near = (pair: Scale): Scale[] => FINE_STEPS.map((d) => ({ x: pair.x * (1 + d), y: pair.y * (1 + d) }))

async function candidateScales(grey: Grey & { data: Uint8Array }): Promise<Scale[]> {
  const detail = await detailOf(grey)
  const xs = scaleGuesses(detail, 'x')
  const ys = scaleGuesses(detail, 'y')
  const uniform = [...xs, ...ys].map((s) => ({ x: s, y: s }))
  const stretched = xs.flatMap((x) => ys.map((y) => ({ x, y }))).filter((pair) => Math.abs(pair.x / pair.y - 1) > 0.02 && Math.abs(pair.x / pair.y - 1) < 0.2)
  return [{ x: 1, y: 1 }, ...[...uniform, ...stretched].flatMap(near)]
}

export async function readTrackingMark(image: Uint8Array): Promise<TrackingRead | null> {
  const grey = await greyOf(image)
  const first = await tryScale(grey, 1, 1)
  if (first) return first
  for (const scale of (await candidateScales(grey)).slice(1)) {
    const read = await tryScale(grey, scale.x, scale.y)
    if (read) return read
  }
  return null
}
