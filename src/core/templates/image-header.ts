// Width and height from the first bytes of a WebP, PNG or JPEG file, without decoding it. Covers
// are WebP (ARCHITECTURE §8.3: long edge 1600, re-encoded on upload); PNG and JPEG are read for
// older uploads. Pure, so it is tested on its own; null when the bytes are not one of these.
export type ImageSize = { width: number; height: number }

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))
const u16le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8)
const u24le = (b: Uint8Array, at: number) => u16le(b, at) | ((b[at + 2] ?? 0) << 16)
const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0)
const u32be = (b: Uint8Array, at: number) => ((u16be(b, at) << 16) >>> 0) + u16be(b, at + 2)

function webp(b: Uint8Array): ImageSize | null {
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  if (chunk === 'VP8L') {
    const bits = ((b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24)) >>> 0
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  return null
}

function png(b: Uint8Array): ImageSize | null {
  if (b[0] !== 0x89 || ascii(b, 1, 3) !== 'PNG' || ascii(b, 12, 4) !== 'IHDR') return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

// JPEG: walk the segments to the first start-of-frame marker (SOF0–SOF15 but not DHT, JPG, DAC).
function jpeg(b: Uint8Array): ImageSize | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null
  let at = 2
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1] ?? 0
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: u16be(b, at + 7), height: u16be(b, at + 5) }
    at += 2 + u16be(b, at + 2)
  }
  return null
}

export function imageSize(bytes: Uint8Array): ImageSize | null {
  const size = webp(bytes) ?? png(bytes) ?? jpeg(bytes)
  return size && size.width > 0 && size.height > 0 ? size : null
}
