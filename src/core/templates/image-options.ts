import { isTallAspect, OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from './output-options'

export type ImageOptions = { resolutions: Resolution[]; aspectRatios: OutputAspect[]; originalRatio: boolean }

// Every fixed ratio a provider can be asked for, tall poster ratios included.
export const PROVIDER_ASPECTS: OutputAspect[] = OUTPUT_ASPECTS.filter((aspect) => aspect !== 'original')
// What a template offers when nothing narrows it: the tall ratios are opt-in per template.
const defaultAspects = PROVIDER_ASPECTS.filter((aspect) => !isTallAspect(aspect))
export const FULL_IMAGE_OPTIONS: ImageOptions = { resolutions: [...RESOLUTIONS], aspectRatios: defaultAspects, originalRatio: true }

// A tall ratio survives only when the list given explicitly names it (ARCHITECTURE §8.1).
export function availableImageOptions(capabilities: ImageOptions, templateRatios?: readonly string[]): ImageOptions {
  const { resolutions, originalRatio } = capabilities
  const aspectRatios = PROVIDER_ASPECTS.filter((ratio) =>
    capabilities.aspectRatios.includes(ratio)
      && (templateRatios ? templateRatios.includes(ratio) : !isTallAspect(ratio)))
  return { resolutions, aspectRatios, originalRatio }
}

// The provider's sizes for one template: the usual ones as they are, a tall poster ratio only if
// the template lists it. OpenAI's stored list predates the tall ratios, so OpenAI offers them all.
export function templateSizes(options: ImageOptions, openAI: boolean, templateRatios: readonly string[]): ImageOptions {
  const offered = openAI ? PROVIDER_ASPECTS : options.aspectRatios
  const aspectRatios = offered.filter((ratio) => !isTallAspect(ratio) || templateRatios.includes(ratio))
  return { ...options, aspectRatios }
}
