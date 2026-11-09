import { OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from './output-options'

export type ImageOptions = { resolutions: Resolution[]; aspectRatios: OutputAspect[]; originalRatio: boolean }
const fixedAspects = OUTPUT_ASPECTS.filter((aspect) => aspect !== 'original')
export const FULL_IMAGE_OPTIONS: ImageOptions = { resolutions: [...RESOLUTIONS], aspectRatios: fixedAspects, originalRatio: true }

export function availableImageOptions(capabilities: ImageOptions, templateRatios?: readonly string[]): ImageOptions {
  const { resolutions, originalRatio } = capabilities
  const aspectRatios = fixedAspects.filter((ratio) =>
    capabilities.aspectRatios.includes(ratio) && (!templateRatios || templateRatios.includes(ratio)))
  return { resolutions, aspectRatios, originalRatio }
}
