import 'server-only'

import { ProviderError, type GenerationProvider, type ProviderInput } from '@/core/jobs'
import type { Resolution } from '@/core/templates'

import { readOpenRouterOutput } from './openrouter-response'

type OpenRouterImageConfig = {
  apiKey: string
  model: string
  fetch?: typeof fetch
  baseUrl?: string
  resolutions?: readonly Resolution[]
}

const IMAGE_SIZE = { '1k': '1K', '2k': '2K', '3k': '4K' } as const

function requestBody(config: OpenRouterImageConfig, input: ProviderInput) {
  // Fixed-size models (e.g. Gemini 2.5 Flash Image) do not accept an image_size override.
  const variableSize = config.resolutions?.some((tier) => tier !== '1k')
  const imageConfig = {
    ...(input.aspectRatio !== 'original' && { aspect_ratio: input.aspectRatio }),
    ...(variableSize && { image_size: IMAGE_SIZE[input.resolution] }),
  }
  const photos = input.images.map(({ bytes, contentType }) => ({
    type: 'image_url',
    image_url: { url: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}` },
  }))
  return {
    model: config.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: input.prompt }, ...photos] }],
    modalities: ['image', 'text'],
    usage: { include: true },
    ...(Object.keys(imageConfig).length > 0 && { image_config: imageConfig }),
  }
}

export function createOpenRouterImageProvider(config: OpenRouterImageConfig): GenerationProvider {
  return {
    id: 'openrouter-image',
    async generate(input) {
      const url = `${config.baseUrl ?? 'https://openrouter.ai/api/v1'}/chat/completions`
      let response: Response
      try {
        response = await (config.fetch ?? fetch)(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://shotviva.com',
            'X-Title': 'Shotviva',
          },
          body: JSON.stringify(requestBody(config, input)),
          signal: input.signal,
          redirect: 'error',
          cache: 'no-store',
        })
      } catch {
        if (input.signal.aborted) throw new ProviderError('timeout', 'openrouter request aborted at deadline')
        throw new ProviderError('failed', 'openrouter request failed')
      }
      return readOpenRouterOutput(response, input, config.model)
    },
  }
}
