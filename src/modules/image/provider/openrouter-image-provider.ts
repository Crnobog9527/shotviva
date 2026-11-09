import 'server-only'

import { ProviderError, type GenerationProvider, type ProviderInput } from '@/core/jobs'

import { readOpenRouterOutput } from './openrouter-response'

type OpenRouterImageConfig = {
  apiKey: string
  model: string
  fetch?: typeof fetch
  baseUrl?: string
}

const IMAGE_SIZE = { '1k': '1K', '2k': '2K', '3k': '4K' } as const

function imageRequest(model: string, input: ProviderInput) {
  const photos = input.images.map(({ bytes, contentType }) => ({
    type: 'image_url',
    image_url: { url: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}` },
  }))
  return {
    model,
    prompt: input.prompt,
    resolution: IMAGE_SIZE[input.resolution],
    aspect_ratio: input.aspectRatio === 'original' ? 'auto' : input.aspectRatio,
    output_format: 'png',
    ...(photos.length > 0 && { input_references: photos }),
  }
}

export function createOpenRouterImageProvider(config: OpenRouterImageConfig): GenerationProvider {
  return {
    id: 'openrouter-image',
    async generate(input) {
      const url = `${config.baseUrl ?? 'https://openrouter.ai/api/v1'}/images`
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
          body: JSON.stringify(imageRequest(config.model, input)),
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
