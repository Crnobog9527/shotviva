import { OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from './output-options'

// exactPixels: the route delivers the site's size table exactly (OpenAI). OpenRouter models answer
// with their own native sizes at 1K and 2K, so the picker marks those sizes as approximate.
// Absent (rows read before migration 1290) counts as exact, as before.
export type ImageOptions = { resolutions: Resolution[]; aspectRatios: OutputAspect[]; originalRatio: boolean; exactPixels?: boolean }
const fixedAspects = OUTPUT_ASPECTS.filter((aspect) => aspect !== 'original')
export const FULL_IMAGE_OPTIONS: ImageOptions = { resolutions: [...RESOLUTIONS], aspectRatios: fixedAspects, originalRatio: true }

export function availableImageOptions(capabilities: ImageOptions, templateRatios?: readonly string[]): ImageOptions {
  const { resolutions, originalRatio, exactPixels } = capabilities
  const aspectRatios = fixedAspects.filter((ratio) =>
    capabilities.aspectRatios.includes(ratio) && (!templateRatios || templateRatios.includes(ratio)))
  return { resolutions, aspectRatios, originalRatio, ...(exactPixels === false && { exactPixels }) }
}
