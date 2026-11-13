import { INPUT_JPEG_QUALITY, INPUT_LONG_EDGE, matteCss, matteFor } from '../rules'

export function targetSize(width: number, height: number, longEdge = INPUT_LONG_EDGE) {
  const scale = Math.min(1, longEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function decode(file: Blob): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    // decode() runs off the main thread; naturalWidth/Height already follow EXIF orientation.
    await image.decode()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  return { image, release: () => URL.revokeObjectURL(url) }
}

// Lets the browser do the downscale natively; where resize options are unsupported the
// bitmap comes back full size and drawImage below still scales it to the target.
async function resized(image: HTMLImageElement, width: number, height: number): Promise<CanvasImageSource> {
  if (typeof createImageBitmap !== 'function') return image
  try {
    return await createImageBitmap(image, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
  } catch {
    return image
  }
}

// About 65k sampled pixels whatever the size: enough to judge the content's brightness.
const MATTE_SAMPLES = 65536

// JPEG has no alpha and the canvas encoder writes transparent pixels as black, which turned a
// transparent logo into a black square for the image model (2026-11-14). A see-through image is
// laid on the shared neutral ground (rules/alpha-matte.ts) behind what was drawn. Skipped for a
// JPEG source, which cannot be see-through, so a phone photo costs no extra pixel read.
export function layOnMatte(context: CanvasRenderingContext2D, width: number, height: number) {
  const step = Math.max(1, Math.floor((width * height) / MATTE_SAMPLES))
  const matte = matteFor(context.getImageData(0, 0, width, height).data, step)
  if (!matte) return
  context.globalCompositeOperation = 'destination-over'
  context.fillStyle = matteCss(matte)
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'source-over'
}

// Long edge 2048, JPEG 0.85 (ARCHITECTURE §8.2). The canvas is only ever target-sized, so a
// 48MP photo never becomes a 48MP canvas (iOS caps canvases near 16.7MP). Re-encoding drops
// EXIF, GPS included. Throws when the browser cannot decode the file; the caller then falls
// back to uploading the original.
export async function compressImage(file: Blob, options?: { longEdge: number; type: 'image/png' | 'image/webp' }): Promise<Blob> {
  const { image, release } = await decode(file)
  try {
    const size = targetSize(image.naturalWidth, image.naturalHeight, options?.longEdge)
    const source = await resized(image, size.width, size.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas 2d unavailable')
    context.drawImage(source, 0, 0, size.width, size.height)
    if ('close' in source && typeof source.close === 'function') source.close()
    if (!options && file.type !== 'image/jpeg') layOnMatte(context, size.width, size.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, options?.type ?? 'image/jpeg', INPUT_JPEG_QUALITY))
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('image encode failed')
    return blob
  } finally {
    release()
  }
}
