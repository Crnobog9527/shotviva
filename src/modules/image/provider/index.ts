import 'server-only'

import type { GenerationProvider } from '@/core/jobs'
import { templateImageProvider, type ProviderAdapters } from '@/core/providers'
import type { Resolution } from '@/core/templates'

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

// A template override applies only to callers supplying its id and the requested resolution.
export function imageProvider(providerId?: string | null, resolution?: Resolution): Promise<GenerationProvider> {
  return templateImageProvider(IMAGE_ADAPTERS, providerId, resolution)
}
