import 'server-only'

import sharp from 'sharp'

// Pure white, the marketplace main-image ground (Amazon and most shops ask for RGB 255).
export const WHITE = '#ffffff'

// JPEG, not PNG: a flattened image has no alpha left to keep, every shop and phone accepts it,
// and it is a fraction of the PNG's size (a 3K cut-out as PNG can pass Vercel's 4.5MB body limit;
// the JPEG is staged on R2 anyway, but stays quick to download on a phone). Quality 95 with full
// chroma (4:4:4) keeps product edges and small print sharp; flat white regions still decode to
// exactly 255, which the tests check.
export const WHITE_JPEG = { quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true } as const

// The 白底 download (ARCHITECTURE §8 「下载白底 / 透明底」): the cut-out flattened onto pure white at
// its full resolution. An opaque image comes back unchanged apart from the format.
export async function flattenOnWhite(image: Uint8Array): Promise<Uint8Array> {
  const output = await sharp(image).flatten({ background: WHITE }).jpeg(WHITE_JPEG).toBuffer()
  return new Uint8Array(output)
}
