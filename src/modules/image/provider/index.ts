import 'server-only'

import type { GenerationProvider, ImageRequestOptions } from '@/core/jobs'
import { templateImageProvider, type ProviderAdapters } from '@/core/providers'

import { createOpenAIImageProvider } from './openai-image-provider'
import { createOpenRouterImageProvider } from './openrouter-image-provider'

export { createOpenAIImageProvider, type OpenAIImageConfig } from './openai-image-provider'
export { OUTPUT_SIZES, formatSize, outputSize, type OutputSize } from './output-size'
export { outputTokens } from './output-tokens'

// The image module's adapters, by the id an ai_providers row names (ARCHITECTURE §3.3).
export const IMAGE_ADAPTERS: ProviderAdapters = {
  openrouter_images: createOpenRouterImageProvider,
  openai_images: (config) => createOpenAIImageProvider(config),
}

// A template override applies only to callers supplying its id and the image request.
export function imageProvider(providerId?: string | null, request?: ImageRequestOptions): Promise<GenerationProvider> {
  return templateImageProvider(IMAGE_ADAPTERS, providerId, request)
}
