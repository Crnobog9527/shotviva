import 'server-only'
import sharp from 'sharp'
import type { ProviderImage } from '@/core/jobs'
import { STYLE_REF_EDGE } from '@/core/templates/style-refs'

// The reference library keeps 2048 px WebPs; T97 sends style references at at most 1536 px.
export async function styleImage(image: ProviderImage): Promise<ProviderImage> {
  if (image.width && image.height && Math.max(image.width, image.height) <= STYLE_REF_EDGE) return image
  const { data, info } = await sharp(image.bytes).resize({ width: STYLE_REF_EDGE, height: STYLE_REF_EDGE, fit: 'inside',
    withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true })
  return { bytes: data, width: info.width, height: info.height, contentType: 'image/webp' }
}
