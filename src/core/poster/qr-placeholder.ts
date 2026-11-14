// Where a poster's QR code goes (ARCHITECTURE §5.3 「二维码」): with the user's QR uploaded, the
// model is told to draw a flat magenta square in its place, and code pastes the real code there,
// so the code on the poster always scans. Pure (raw RGB pixels in, a box out), so it is tested
// without images; the pasting is in './qr-paste' (server).

// What the model is asked to draw: chosen because no poster style draws large flat areas of it
// (the purple style's neon is a gradient, not a filled square).
export const QR_PLACEHOLDER_HEX = '#FF00FF'

// Added after a page's text when the user uploaded a QR code. Plain words, not a quoted label, so
// the model does not set them as text; the caption is the footer's QR line, already in the list.
export const QR_PLACEHOLDER_INSTRUCTION = [
  'QR code: the real QR code is added to this poster after you draw it, so do not draw any QR code, barcode or square dot pattern anywhere.',
  `Where the QR code belongs in the footer, draw one plain square filled with a single flat solid magenta colour (${QR_PLACEHOLDER_HEX}), about one eighth of the poster width, with nothing inside it: no border, frame, pattern, icon, shadow or text.`,
  'Keep the QR caption from the footer text right under that square. Use this magenta nowhere else on the poster.',
].join(' ')

export type Box = { left: number; top: number; width: number; height: number }
export type Raster = { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number }

// Model colours drift and the output is resampled: anything strongly red and blue with little
// green reads as the placeholder.
export function isPlaceholderPixel(r: number, g: number, b: number): boolean {
  return r >= 170 && b >= 170 && g <= 100 && Math.abs(r - b) <= 80
}

// A square is a plausible QR spot when it is square, filled, at least 5% of the poster's width
// and no more than a fifth of it (a poster drawn mostly in magenta has no placeholder to find).
const SQUARE = { minAspect: 0.75, maxAspect: 1.33, minFill: 0.8, minSide: 0.05, maxSide: 0.4 }

type Component = Box & { count: number }

function mask(raster: Raster): Uint8Array {
  const { data, width, height, channels } = raster
  const out = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const o = i * channels
    out[i] = isPlaceholderPixel(data[o]!, data[o + 1]!, data[o + 2]!) ? 1 : 0
  }
  return out
}

// The 4-neighbours of pixel i that are inside the image.
function neighbours(i: number, width: number, height: number): number[] {
  const x = i % width
  const out: number[] = []
  if (x > 0) out.push(i - 1)
  if (x < width - 1) out.push(i + 1)
  if (i >= width) out.push(i - width)
  if (i < width * (height - 1)) out.push(i + width)
  return out
}

// One 4-connected component from `start`, marking it seen; an explicit stack, no recursion.
function grow(start: number, marked: Uint8Array, seen: Uint8Array, width: number, height: number): Component {
  let [minX, minY, maxX, maxY, count] = [width, height, 0, 0, 0]
  const stack = [start]
  seen[start] = 1
  while (stack.length) {
    const i = stack.pop()!
    const x = i % width
    const y = (i - x) / width
    count++
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    for (const n of neighbours(i, width, height)) {
      if (marked[n] && !seen[n]) { seen[n] = 1; stack.push(n) }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1, count }
}

function components(marked: Uint8Array, width: number, height: number): Component[] {
  const seen = new Uint8Array(marked.length)
  const found: Component[] = []
  for (let start = 0; start < marked.length; start++) {
    if (marked[start] && !seen[start]) found.push(grow(start, marked, seen, width, height))
  }
  return found
}

function plausible(c: Component, imageWidth: number): boolean {
  const aspect = c.width / c.height
  const side = Math.min(c.width, c.height) / imageWidth
  return aspect >= SQUARE.minAspect && aspect <= SQUARE.maxAspect && c.count / (c.width * c.height) >= SQUARE.minFill
    && side >= SQUARE.minSide && Math.max(c.width, c.height) / imageWidth <= SQUARE.maxSide
}

// The placeholder in (usually downscaled) pixels: the largest plausible square, or null.
export function findPlaceholder(raster: Raster): Box | null {
  const found = components(mask(raster), raster.width, raster.height).filter((c) => plausible(c, raster.width))
  const best = found.sort((a, b) => b.count - a.count)[0]
  return best ? { left: best.left, top: best.top, width: best.width, height: best.height } : null
}

// The template's fixed spot (fields.poster.qr.fallback, fractions of the poster) in pixels:
// used when the model drew no placeholder, so a fake code it drew there is covered all the same.
export type QrFallback = { x: number; y: number; size: number }

export function fallbackBox(spot: QrFallback, width: number, height: number): Box {
  const side = Math.round(spot.size * width)
  const left = Math.min(Math.max(0, Math.round(spot.x * width)), width - side)
  const top = Math.min(Math.max(0, Math.round(spot.y * height)), height - side)
  return { left, top, width: side, height: side }
}

// A box found at one scale, in another's pixels, grown by `pad` and kept inside the image.
export function scaleBox(box: Box, scale: number, pad: number, width: number, height: number): Box {
  const left = Math.max(0, Math.floor(box.left * scale) - pad)
  const top = Math.max(0, Math.floor(box.top * scale) - pad)
  const right = Math.min(width, Math.ceil((box.left + box.width) * scale) + pad)
  const bottom = Math.min(height, Math.ceil((box.top + box.height) * scale) + pad)
  return { left, top, width: right - left, height: bottom - top }
}
