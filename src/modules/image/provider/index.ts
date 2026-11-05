import 'server-only'

import { serverEnv } from '@/core/env'
import { AppError } from '@/core/errors'
import type { GenerationProvider } from '@/core/jobs'

import { createOpenAIImageProvider } from './openai-image-provider'

export { createOpenAIImageProvider, type OpenAIImageConfig } from './openai-image-provider'
export { outputSizeFor } from './output-size'

// The image module's provider (ARCHITECTURE §3.2: GPT-Image-2.5 only in v1).
export function openaiImageProvider(): GenerationProvider {
  const { OPENAI_API_KEY, OPENAI_IMAGE_MODEL } = serverEnv()
  if (!OPENAI_API_KEY) throw new AppError('INTERNAL', 'OPENAI_API_KEY is not configured')
  return createOpenAIImageProvider({ apiKey: OPENAI_API_KEY, model: OPENAI_IMAGE_MODEL })
}
