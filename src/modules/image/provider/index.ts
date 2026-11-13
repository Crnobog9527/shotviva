import 'server-only'

import type { GenerationProvider, ImageRequestOptions } from '@/core/jobs'
import { serverEnv } from '@/core/env'
import { templateImageProvider, type ProviderAdapters } from '@/core/providers'

import { createArkImageProvider } from './ark-image-provider'

import { createOpenAIImageProvider } from './openai-image-provider'
import { createOpenRouterImageProvider } from './openrouter-image-provider'

export { createOpenAIImageProvider, type OpenAIImageConfig } from './openai-image-provider'
export { OUTPUT_SIZES, formatSize, outputSize, type OutputSize } from './output-size'
export { outputTokens } from './output-tokens'

// The image module's adapters, by the id an ai_providers row names (ARCHITECTURE §3.3).
export const IMAGE_ADAPTERS: ProviderAdapters = {
  openrouter_images: createOpenRouterImageProvider,
  openai_images: (config) => createOpenAIImageProvider(config),
  ark_images: (config) => createArkImageProvider({ ...config, cnyPerUsd: serverEnv().CNY_PER_USD }),
}

// A template override applies only to callers supplying its id and the image request.
export function imageProvider(providerId?: string | null, request?: ImageRequestOptions): Promise<GenerationProvider> {
  return templateImageProvider(IMAGE_ADAPTERS, providerId, request)
}
