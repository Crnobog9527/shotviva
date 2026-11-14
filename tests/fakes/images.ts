import sharp from 'sharp'

// Real encoded images so sharp, sniffing and the watermark run for real in tests.
export async function jpeg(width: number, height: number, options: { exif?: boolean } = {}): Promise<Uint8Array> {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 150, b: 100 } } })
  if (options.exif) image = image.withExif({ IFD0: { Make: 'TestPhone', Model: 'GPS Leaker' } })
  return new Uint8Array(await image.jpeg({ quality: 80 }).toBuffer())
}

export async function png(width: number, height: number): Promise<Uint8Array> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } } })
  return new Uint8Array(await image.png().toBuffer())
}

// Just the ISO-BMFF header of an iPhone HEIC: enough to be recognised, never decodable.
export function heicHeader(): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set([0, 0, 0, 0x18], 0)
  bytes.set(new TextEncoder().encode('ftypheic'), 4)
  return bytes
}

export const text = (value: string) => new TextEncoder().encode(value)

// A three-frame animated GIF, for the motion cover path (→ animated WebP + poster).
export async function animatedGif(width = 64, height = 48): Promise<Uint8Array> {
  const frame = (r: number) => sharp({ create: { width, height, channels: 3, background: { r, g: 40, b: 40 } } }).png().toBuffer()
  const frames = await Promise.all([frame(10), frame(200), frame(90)])
  return new Uint8Array(await sharp(frames, { join: { animated: true } }).gif().toBuffer())
}

// The smallest MP4 the cover check reads: ftyp + moov/mvhd (version 0) saying `seconds` long.
// Not playable, which the server never needs (it does not transcode covers).
export function mp4Header(seconds: number, version: 0 | 1 = 0): Uint8Array {
  const box = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length)
    new DataView(out.buffer).setUint32(0, out.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(body, 8)
    return out
  }
  const mvhd = new Uint8Array(version === 1 ? 112 : 100)
  const view = new DataView(mvhd.buffer)
  view.setUint8(0, version)
  if (version === 1) {
    view.setUint32(20, 1000)
    view.setBigUint64(24, BigInt(Math.round(seconds * 1000)))
  } else {
    view.setUint32(12, 1000)
    view.setUint32(16, Math.round(seconds * 1000))
  }
  const ftyp = box('ftyp', new TextEncoder().encode('isom\0\0\0\0isomavc1'))
  const moov = box('moov', box('mvhd', mvhd))
  const out = new Uint8Array(ftyp.length + moov.length)
  out.set(ftyp)
  out.set(moov, ftyp.length)
  return out
}
