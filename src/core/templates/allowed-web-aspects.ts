import { AppError } from '../errors'
import { FULL_IMAGE_OPTIONS, type ImageOptions } from './image-options'
import type { Resolution } from './output-options'

// Check at request time, before a decision call or reservation. The catalogue the visitor
// opened may predate a provider change. An empty capability record offers no sizes.
export function allowedWebAspects(options: ImageOptions | undefined, resolution: Resolution): readonly string[] {
  const current = options ?? FULL_IMAGE_OPTIONS
  if (!current.resolutions.includes(resolution)) throw new AppError('INVALID_INPUT', 'Unsupported resolution')
  return current.originalRatio ? ['original', ...current.aspectRatios] : current.aspectRatios
}
