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

function imageRequest(config: OpenRouterImageConfig, input: ProviderInput) {
  const photos = input.images.map(({ bytes, contentType }) => ({
    type: 'image_url',
    image_url: { url: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}` },
  }))
  // FLUX 3 exposes its reference-image editing contract on the dedicated Image API.
  if (config.model === 'black-forest-labs/flux-3-image-klein' || config.model === 'black-forest-labs/flux-3-image') {
    return {
      path: '/images',
      body: {
        model: config.model, prompt: input.prompt, resolution: IMAGE_SIZE[input.resolution],
        aspect_ratio: input.aspectRatio === 'original' ? 'auto' : input.aspectRatio,
        output_format: 'png', ...(photos.length > 0 && { input_references: photos }),
      },
    }
  }
  // Fixed-size models (e.g. Gemini 2.5 Flash Image) do not accept an image_size override.
  const variableSize = config.resolutions?.some((tier) => tier !== '1k')
  const imageConfig = {
    ...(input.aspectRatio !== 'original' && { aspect_ratio: input.aspectRatio }),
    ...(variableSize && { image_size: IMAGE_SIZE[input.resolution] }),
  }
  return {
    path: '/chat/completions',
    body: {
      model: config.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: input.prompt }, ...photos] }],
      modalities: ['image', 'text'],
      usage: { include: true },
      ...(Object.keys(imageConfig).length > 0 && { image_config: imageConfig }),
    },
  }
}

export function createOpenRouterImageProvider(config: OpenRouterImageConfig): GenerationProvider {
  return {
    id: 'openrouter-image',
    async generate(input) {
      const request = imageRequest(config, input)
      const url = `${config.baseUrl ?? 'https://openrouter.ai/api/v1'}${request.path}`
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
          body: JSON.stringify(request.body),
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
