import type { ImageRequestOptions } from '../jobs/provider'
import type { OpenRouterImageParameters } from './openrouter-catalog'

export const OPENROUTER_IMAGE_SIZE = { '1k': '1K', '2k': '2K', '3k': '4K' } as const

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

export function openRouterInputMismatch(input: ImageRequestOptions, parameters: OpenRouterImageParameters) {
  const supportedSizes = parameters.resolution?.values ?? [OPENROUTER_IMAGE_SIZE['1k']]
  if (!supportedSizes.includes(OPENROUTER_IMAGE_SIZE[input.resolution])) {
    return { reason: 'unsupported_resolution', message: 'This model does not support the selected resolution.' }
  }
  // 'original' can be omitted on models without auto. An explicit ratio needs declared support.
  if (input.aspectRatio !== 'original' && !parameters.aspect_ratio?.values.includes(input.aspectRatio)) {
    return { reason: 'unsupported_aspect_ratio', message: 'This model does not support the selected aspect ratio.' }
  }
  return referenceMismatch(input.referenceCount, parameters.input_references)
}
