import 'server-only'

import type { GenerationProvider } from '@/core/jobs'
import { activeProvider, type ProviderAdapters } from '@/core/providers'

import { createOpenAIImageProvider } from './openai-image-provider'

export { createOpenAIImageProvider, type OpenAIImageConfig } from './openai-image-provider'
export { OUTPUT_SIZES, formatSize, outputSize, type OutputSize } from './output-size'

// The image module's adapters, by the id an ai_providers row names (ARCHITECTURE §3.3).
export const IMAGE_ADAPTERS: ProviderAdapters = {
  openai_images: (config) => createOpenAIImageProvider(config),
}

// The provider for one generation request: the active row in /admin/providers, else the
// OPENAI_* env fallback. Web and partner routes both call this.
export function imageProvider(): Promise<GenerationProvider> {
  return activeProvider('image', IMAGE_ADAPTERS)
}
