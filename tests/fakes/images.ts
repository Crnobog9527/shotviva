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
