import { INPUT_JPEG_QUALITY, INPUT_LONG_EDGE } from '@/core/storage/rules'

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

// Long edge 2048, JPEG 0.85 (ARCHITECTURE §8.2). The canvas is only ever target-sized, so a
// 48MP photo never becomes a 48MP canvas (iOS caps canvases near 16.7MP). Re-encoding drops
// EXIF, GPS included. Throws when the browser cannot decode the file; the caller then falls
// back to uploading the original.
export async function compressImage(file: Blob): Promise<Blob> {
  const { image, release } = await decode(file)
  try {
    const size = targetSize(image.naturalWidth, image.naturalHeight)
    const source = await resized(image, size.width, size.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas 2d unavailable')
    context.drawImage(source, 0, 0, size.width, size.height)
    if ('close' in source && typeof source.close === 'function') source.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', INPUT_JPEG_QUALITY))
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('jpeg encode failed')
    return blob
  } finally {
    release()
  }
}
