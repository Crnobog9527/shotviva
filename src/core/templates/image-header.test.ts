import { describe, expect, it } from 'vitest'

import { imageSize } from './image-header'

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)))
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]

describe('image size from the header', () => {
  it('reads an extended WebP (VP8X: 24-bit width − 1 and height − 1)', () => {
    const header = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], le24(1199), le24(1599))
    expect(imageSize(header)).toEqual({ width: 1200, height: 1600 })
  })

  it('reads a lossy WebP (VP8 frame header)', () => {
    const header = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], [0x40, 0x06], [0x80, 0x0c])
    expect(imageSize(header)).toEqual({ width: 1600, height: 3200 })
  })

  it('reads a lossless WebP (VP8L packed 14-bit sizes)', () => {
    const packed = (1599 | (899 << 14)) >>> 0
    const header = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8L', [0, 0, 0, 0], [0x2f], [packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >>> 24) & 0xff])
    expect(imageSize(header)).toEqual({ width: 1600, height: 900 })
  })

  it('reads a PNG IHDR and a JPEG start-of-frame after an APP segment', () => {
    const png = bytes([0x89], 'PNG', [13, 10, 26, 10], [0, 0, 0, 13], 'IHDR', [0, 0, 4, 0], [0, 0, 3, 0])
    expect(imageSize(png)).toEqual({ width: 1024, height: 768 })
    const jpeg = bytes([0xff, 0xd8], [0xff, 0xe0], be16(4), [0, 0], [0xff, 0xc0], be16(17), [8], be16(1350), be16(1080), Array(12).fill(0))
    expect(imageSize(jpeg)).toEqual({ width: 1080, height: 1350 })
  })

  it('gives null for anything else', () => {
    expect(imageSize(bytes('GIF89a', [0, 0, 0, 0]))).toBeNull()
    expect(imageSize(new Uint8Array())).toBeNull()
  })
})
