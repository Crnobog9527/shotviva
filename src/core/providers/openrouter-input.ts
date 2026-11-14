import type { ImageRequestOptions } from '../jobs/provider'
import { RESOLUTIONS, type Resolution } from '../templates/output-options'
import type { OpenRouterImageParameters } from './openrouter-catalog'
import { openAIFreeSizeModel, openAIImageTiers } from './tier-support'

export const OPENROUTER_IMAGE_SIZE = { '1k': '1K', '2k': '2K', '4k': '4K' } as const

// OpenRouter's catalogue lists no `resolution` for OpenAI's GPT image models: its Images API
// forwards an explicit `size` ("2048x2048") to OpenAI instead. gpt-image-2 and later take any
// size the official line sends, so on OpenRouter they get the official tiers, ratios and sizes.
// A catalogue that starts listing a resolution enum wins again.
export function openRouterPixelSize(model: string, parameters: OpenRouterImageParameters): boolean {
  return !parameters.resolution && model.startsWith('openai/') && openAIFreeSizeModel(model.slice('openai/'.length))
}

// Models with neither a resolution parameter nor pixel sizes produce one native size (1K).
export function openRouterTiers(model: string, parameters: OpenRouterImageParameters): Resolution[] {
  if (openRouterPixelSize(model, parameters)) return [...openAIImageTiers(model.slice('openai/'.length)).tiers]
  const sizes = parameters.resolution?.values
  return sizes ? RESOLUTIONS.filter((tier) => sizes.includes(OPENROUTER_IMAGE_SIZE[tier])) : ['1k']
}

// Used both when choosing a template's provider and when calling OpenRouter directly.
function referenceMismatch(count: number, range: OpenRouterImageParameters['input_references']) {
  const max = range?.max ?? 0
  if (count > max) {
    return { reason: 'reference_image_limit', message: `This model accepts at most ${max} reference images; received ${count}.` }
  }
  if (count < (range?.min ?? 0)) {
    return { reason: 'reference_images_required', message: 'This model requires more reference images.' }
  }
  return null
}

export function openRouterInputMismatch(input: ImageRequestOptions, parameters: OpenRouterImageParameters, model: string) {
  if (!openRouterTiers(model, parameters).includes(input.resolution)) {
    return { reason: 'unsupported_resolution', message: 'This model does not support the selected resolution.' }
  }
  // 'original' can be omitted on models without auto. An explicit ratio needs declared support,
  // unless the request carries it as a pixel size.
  const ratioOk = input.aspectRatio === 'original' || openRouterPixelSize(model, parameters)
    || parameters.aspect_ratio?.values.includes(input.aspectRatio)
  if (!ratioOk) {
    return { reason: 'unsupported_aspect_ratio', message: 'This model does not support the selected aspect ratio.' }
  }
  return referenceMismatch(input.referenceCount, parameters.input_references)
}
