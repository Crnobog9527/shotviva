// Cheap checks for "does this result have see-through pixels?", kept pure so they run in tests.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
// Alpha below this counts as see-through; 250+ is encoder noise on an opaque photo.
const OPAQUE_FLOOR = 250

export function isPng(head: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => head[index] === byte)
}

export function isJpeg(head: Uint8Array): boolean {
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
}

const readU32 = (bytes: Uint8Array, at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
const chunkType = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at + 4, at + 8))

// From the first bytes of a PNG: colour type 4 or 6 carries an alpha channel, and a tRNS
// chunk (always before IDAT) marks a transparent colour. An opaque RGB PNG needs no decode.
// When the head runs out before IDAT the answer is "maybe", so the caller decodes to be sure.
export function pngMayHaveAlpha(head: Uint8Array): boolean {
  if (!isPng(head) || head.length < 26) return false
  const colourType = head[25]
  if (colourType === 4 || colourType === 6) return true
  let at = PNG_SIGNATURE.length
  while (at + 8 <= head.length) {
    const type = chunkType(head, at)
    if (type === 'tRNS') return true
    if (type === 'IDAT' || type === 'IEND') return false
    at += 12 + readU32(head, at)
  }
  return true
}

// Over RGBA pixels (canvas getImageData order): any pixel a viewer could see through.
export function hasTransparentPixel(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < OPAQUE_FLOOR) return true
  }
  return false
}
