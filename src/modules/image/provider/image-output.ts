import 'server-only'

import sharp from 'sharp'

import type { ProviderInput } from '@/core/jobs'
import { sniffImageType } from '@/core/storage'

import { outputSize, sourcePhoto } from './output-size'

// A vendor's base64 image as the site's PNG. Throws on anything that is not a real image of the
// declared type; callers turn that into a provider failure. Shared by the OpenRouter and Ark
// adapters, which both return b64_json.
export async function pngFromBase64(b64: string, mediaType: string | null | undefined, input: ProviderInput): Promise<Uint8Array> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Error('invalid base64 image')
  const bytes = Buffer.from(b64, 'base64')
  const type = sniffImageType(bytes)
  if (!type || type === 'image/heic' || (mediaType && type !== mediaType)) throw new Error('invalid image format')
  // All downstream outputs are PNG. Limit decode memory and preserve framing on the 4K → 3K conversion.
  const image = sharp(bytes, { limitInputPixels: 32_000_000 }).rotate()
  if (input.resolution === '3k') {
    image.resize({ ...outputSize('3k', input.aspectRatio, sourcePhoto(input)), fit: 'inside', withoutEnlargement: true })
  }
  return image.png().toBuffer()
}
