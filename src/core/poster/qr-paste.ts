import 'server-only'

import jsQR from 'jsqr'
import sharp, { type Sharp } from 'sharp'

import { fallbackBox, findPlaceholder, fringeLayer, scaleBox, tightBox, type Box, type QrFallback } from './qr-placeholder'

// The user's QR code pasted onto a finished poster (ARCHITECTURE §5.3 「二维码」): into the magenta
// square the model drew, else onto the template's fixed spot, then read back. A poster whose
// pasted code does not read back is never handed over: the caller fails the job (refunded).

// The code itself, cut out of the upload (a WeChat card's avatar and name dropped), and what it
// says, which the pasted copy must read back as.
export type UserQr = { data: string; png: Buffer }

// Uploads are read at most this wide; bigger only slows the decoder.
const READ_EDGE = 1600
// Placeholder search runs on a copy this wide.
const FIND_EDGE = 512
// White margin around the pasted code, per side, as a share of the square (the standard's four
// modules on a typical 25–41 module code).
const QUIET = 0.1

const WHITE = { r: 255, g: 255, b: 255 }

async function rgba(image: Sharp) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height }
}

function decode(pixels: { data: Uint8ClampedArray; width: number; height: number }) {
  return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })
}

// The QR in an upload, or null when none can be read (the editor refuses the upload then).
export async function readUserQr(bytes: Uint8Array): Promise<UserQr | null> {
  const base = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().flatten({ background: WHITE })
    .resize({ width: READ_EDGE, height: READ_EDGE, fit: 'inside', withoutEnlargement: true })
  const flat = await base.png().toBuffer()
  const pixels = await rgba(sharp(flat))
  const code = decode(pixels)
  if (!code || !code.data) return null
  const corners = Object.values(code.location).filter((point) => point && typeof point.x === 'number')
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const crop = scaleBox({ left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
    1, 1, pixels.width, pixels.height)
  const png = await sharp(flat).extract(crop).png().toBuffer()
  return { data: code.data, png }
}

type Style = 'smooth' | 'crisp'
type Layer = { input: Buffer; left: number; top: number }

// A white square over the whole box with the code centred in it, over `cleanup` (the
// placeholder's white fringe, and the placeholder itself when the code went elsewhere); `crisp`
// snaps the scaled code to black and white, which reads where a soft upscale does not.
async function compose(poster: Buffer, qr: UserQr, box: Box, cleanup: Layer[], style: Style): Promise<Buffer> {
  const side = Math.min(box.width, box.height)
  const inner = Math.max(21, Math.round(side * (1 - 2 * QUIET)))
  let code = sharp(qr.png).resize(inner, inner, { fit: 'fill', kernel: style === 'crisp' ? 'nearest' : 'lanczos3' }).flatten({ background: WHITE })
  if (style === 'crisp') code = code.greyscale().threshold(128)
  return sharp(poster).composite([
    ...cleanup,
    await whiteBox(box),
    { input: await code.png().toBuffer(), left: box.left + Math.round((box.width - inner) / 2), top: box.top + Math.round((box.height - inner) / 2) },
  ]).png().toBuffer()
}

async function whiteBox(box: Box): Promise<Layer> {
  const input = await sharp({ create: { width: box.width, height: box.height, channels: 3, background: WHITE } }).png().toBuffer()
  return { input, left: box.left, top: box.top }
}

// Whether the pasted code reads back as the upload's, from the box and a margin around it only.
async function readsBack(poster: Buffer, box: Box, expected: string, size: { width: number; height: number }): Promise<boolean> {
  const region = scaleBox(box, 1, Math.round(box.width * 0.1), size.width, size.height)
  const pixels = await rgba(sharp(poster).extract(region).resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }))
  return decode(pixels)?.data === expected
}

type Placeholder = { box: Box; fringe: Layer }

// Found on a small copy, then measured again at full size: the square's own pixels give the box,
// its blended edge a white layer, so nothing next to the square (the caption) is covered.
async function findSquare(poster: Buffer, width: number, height: number): Promise<Placeholder | null> {
  const small = await sharp(poster).removeAlpha().resize({ width: FIND_EDGE, height: FIND_EDGE, fit: 'inside' }).raw().toBuffer({ resolveWithObject: true })
  const found = findPlaceholder({ data: small.data, width: small.info.width, height: small.info.height, channels: small.info.channels })
  if (!found) return null
  const scale = width / small.info.width
  const region = scaleBox(found, scale, Math.ceil(scale) + 6, width, height)
  const crop = await sharp(poster).removeAlpha().extract(region).raw().toBuffer({ resolveWithObject: true })
  const raster = { data: crop.data, width: crop.info.width, height: crop.info.height, channels: crop.info.channels }
  const box = tightBox(raster, region)
  if (!box) return null
  const layer = fringeLayer(raster, region, box)
  const fringe = await sharp(Buffer.from(layer), { raw: { width: raster.width, height: raster.height, channels: 4 } }).png().toBuffer()
  return { box, fringe: { input: fringe, left: region.left, top: region.top } }
}

export type PastedQr = { bytes: Buffer; placed: 'placeholder' | 'fallback' }
type Spot = { box: Box; placed: PastedQr['placed']; cleanup: Layer[] }

// The placeholder first, then the template's fixed spot; a placeholder that could not take the
// code is still painted over there, never left magenta.
async function spotsFor(square: Placeholder | null, fallback: QrFallback | null, width: number, height: number): Promise<Spot[]> {
  const spots: Spot[] = square ? [{ box: square.box, placed: 'placeholder', cleanup: [square.fringe] }] : []
  const erase = square ? [square.fringe, await whiteBox(square.box)] : []
  if (fallback) spots.push({ box: fallbackBox(fallback, width, height), placed: 'fallback', cleanup: erase })
  return spots
}

// The poster with the code pasted and read back: each spot tried smooth, then crisp. Throws when
// no attempt reads back.
export async function pasteUserQr(posterBytes: Uint8Array, qr: UserQr, fallback: QrFallback | null): Promise<PastedQr> {
  const poster = Buffer.from(posterBytes)
  const { width = 0, height = 0 } = await sharp(poster).metadata()
  const square = await findSquare(poster, width, height)
  for (const spot of await spotsFor(square, fallback, width, height)) {
    for (const style of ['smooth', 'crisp'] as const) {
      const bytes = await compose(poster, qr, spot.box, spot.cleanup, style)
      if (await readsBack(bytes, spot.box, qr.data, { width, height })) return { bytes, placed: spot.placed }
    }
  }
  throw new Error(square || fallback ? 'pasted QR code does not read back' : 'no place for the QR code')
}
