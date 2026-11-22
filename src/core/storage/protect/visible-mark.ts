import 'server-only'

import sharp from 'sharp'

import { MARK_LABEL, MARK_TILE } from './mark-assets.generated'
import { ANGLE_DEGREES, labelPlacement, rotateAboutCentre, rowOpacity, tileAnchors, tileFontPx, type Size } from './mark-geometry'

// The visible mark of a free work as one straight-alpha RGBA layer the size of the picture: the
// −30° tiles (opacity set per row, mark-geometry.ts) under the bottom-right label. Built from the
// bitmaps scripts/build-watermark.ts rendered, so no font is needed here (Vercel has none).
export type Overlay = Size & { rgba: Uint8Array }

type Bitmap = Size & { data: Buffer }

const TILE_PNG = Buffer.from(MARK_TILE.png, 'base64')
const LABEL_PNG = Buffer.from(MARK_LABEL.png, 'base64')
let tileSize: Promise<Size> | null = null
let labelSize: Promise<Size> | null = null

const sizeOf = async (png: Buffer): Promise<Size> => {
  const { width, height } = await sharp(png).metadata()
  return { width: width ?? 1, height: height ?? 1 }
}

// The tile scaled so its font is 4% of the picture width, then turned −30°, and where its
// baseline-left anchor ends up inside the turned bitmap.
async function turnedTile(size: Size): Promise<Bitmap & { anchorX: number; anchorY: number }> {
  tileSize ??= sizeOf(TILE_PNG)
  const base = await tileSize
  const scale = tileFontPx(size) / MARK_TILE.font
  const scaled = { width: Math.max(1, Math.round(base.width * scale)), height: Math.max(1, Math.round(base.height * scale)) }
  const { data, info } = await sharp(TILE_PNG)
    .resize(scaled.width, scaled.height, { fit: 'fill' })
    .rotate(ANGLE_DEGREES, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  // The anchor turns with the bitmap about its centre; the turned bitmap is centred the same way.
  const turned = rotateAboutCentre(scaled, MARK_TILE.anchorX * scale, MARK_TILE.anchorY * scale)
  const anchorX = turned.x + (info.width - scaled.width) / 2
  const anchorY = turned.y + (info.height - scaled.height) / 2
  return { data, width: info.width, height: info.height, anchorX, anchorY }
}

async function scaledLabel(size: Size): Promise<Bitmap & { left: number; top: number }> {
  labelSize ??= sizeOf(LABEL_PNG)
  const place = labelPlacement(size, { ...(await labelSize), font: MARK_LABEL.font })
  const { data, info } = await sharp(LABEL_PNG).resize(place.width, place.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, left: place.left, top: place.top }
}

// Source-over of one straight-alpha RGBA bitmap onto the layer, clipped to it; `opacity(row)`
// scales the bitmap's alpha per layer row.
function blit(layer: Overlay, bitmap: Bitmap, left: number, top: number, opacity: (row: number) => number) {
  const x0 = Math.max(0, left)
  const x1 = Math.min(layer.width, left + bitmap.width)
  for (let y = Math.max(0, top); y < Math.min(layer.height, top + bitmap.height); y++) {
    const rowAlpha = opacity(y)
    for (let x = x0; x < x1; x++) {
      const s = ((y - top) * bitmap.width + (x - left)) * 4
      const a = (bitmap.data[s + 3]! / 255) * rowAlpha
      if (a <= 0) continue
      const d = (y * layer.width + x) * 4
      const below = layer.rgba[d + 3]! / 255
      const out = a + below * (1 - a)
      for (let c = 0; c < 3; c++) layer.rgba[d + c] = Math.round((bitmap.data[s + c]! * a + layer.rgba[d + c]! * below * (1 - a)) / out)
      layer.rgba[d + 3] = Math.round(out * 255)
    }
  }
}

async function buildOverlay(size: Size): Promise<Overlay> {
  const layer: Overlay = { ...size, rgba: new Uint8Array(size.width * size.height * 4) }
  const tile = await turnedTile(size)
  for (const anchor of tileAnchors(size)) {
    const left = Math.round(anchor.x - tile.anchorX)
    const top = Math.round(anchor.y - tile.anchorY)
    if (left >= size.width || top >= size.height || left + tile.width <= 0 || top + tile.height <= 0) continue
    blit(layer, tile, left, top, (row) => rowOpacity(size, row))
  }
  const label = await scaledLabel(size)
  blit(layer, label, label.left, label.top, () => 1)
  return layer
}

// A warm function serves the same few sizes again and again (gallery widths, thumbnails), so the
// last few layers are kept. Each is width × height × 4 bytes (≈ 4.7MB at 1080 × 1080).
const CACHE_SIZE = 6
const cache = new Map<string, Promise<Overlay>>()

export function overlayFor(size: Size): Promise<Overlay> {
  const key = `${size.width}x${size.height}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const made = buildOverlay(size)
  made.catch(() => cache.delete(key))
  cache.set(key, made)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  return made
}

// Source-over of the layer onto an RGBA picture of the same size, in place. A see-through pixel
// of a cut-out takes the mark's own alpha, so the 透明底 file carries the mark too.
export function applyOverlay(picture: Uint8Array, overlay: Overlay): void {
  const { rgba } = overlay
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]! / 255
    if (a === 0) continue
    const below = picture[i + 3]! / 255
    const out = a + below * (1 - a)
    for (let c = 0; c < 3; c++) picture[i + c] = Math.round((rgba[i + c]! * a + picture[i + c]! * below * (1 - a)) / out)
    picture[i + 3] = Math.round(out * 255)
  }
}
