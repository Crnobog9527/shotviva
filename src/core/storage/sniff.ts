// What the bytes really are. The PUT's Content-Type is whatever the browser claimed, so a
// renamed text file arrives as "image/jpeg"; the magic bytes cannot lie that way.
export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end))

// ISO-BMFF brands used by HEIC/HEIF/AVIF stills; all are undecodable on Vercel's sharp.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif'])

const SIGNATURES: { type: SniffedType; test: (bytes: Uint8Array) => boolean }[] = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', test: (b) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' },
  { type: 'image/webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  { type: 'image/heic', test: (b) => ascii(b, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(b, 8, 12)) },
]

export function sniffImageType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length < 12) return null
  return SIGNATURES.find((signature) => signature.test(bytes))?.type ?? null
}
