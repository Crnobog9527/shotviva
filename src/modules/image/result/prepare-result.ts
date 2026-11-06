import { hasTransparentPixel, isJpeg, isPng, pngMayHaveAlpha } from './transparency'

export type PreparedResult = { shareBlob: Blob; transparent: boolean }

// The alpha check reads a thumbnail, not 8M pixels: any cut-out region big enough to matter
// survives the downscale as partly transparent pixels.
const SAMPLE_EDGE = 128
const JPEG_QUALITY = 0.92
// Share hands the OS a JPEG (MOBILE_UI_rules §1.8.1 rule 4) and JPEG has no alpha: without a
// fill the cut-out lands on black. White matches how the app shows it. Output pixels, not UI.
const SHARE_FILL = '#FFFFFF'
const HEAD_BYTES = 4096

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function sampleIsTransparent(bitmap: ImageBitmap): boolean {
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvasOf(width, height).getContext('2d', { willReadFrequently: true })
  if (!context) return false
  context.drawImage(bitmap, 0, 0, width, height)
  return hasTransparentPixel(context.getImageData(0, 0, width, height).data)
}

async function flattenToJpeg(bitmap: ImageBitmap): Promise<Blob | null> {
  const canvas = canvasOf(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = SHARE_FILL
  context.fillRect(0, 0, bitmap.width, bitmap.height)
  context.drawImage(bitmap, 0, 0)
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
}

// One decode serves both: whether the photo has see-through pixels (so the result page can
// offer the checkerboard) and the JPEG Share hands over. Free works arrive as watermarked
// JPEG and skip all of it; any failure falls back to the original bytes, shown as opaque.
export async function prepareResult(blob: Blob): Promise<PreparedResult> {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer())
  if (isJpeg(head)) return { shareBlob: blob, transparent: false }
  const mayHaveAlpha = isPng(head) ? pngMayHaveAlpha(head) : true
  try {
    const bitmap = await createImageBitmap(blob)
    try {
      const transparent = mayHaveAlpha && sampleIsTransparent(bitmap)
      return { shareBlob: (await flattenToJpeg(bitmap)) ?? blob, transparent }
    } finally {
      bitmap.close()
    }
  } catch {
    return { shareBlob: blob, transparent: false }
  }
}
