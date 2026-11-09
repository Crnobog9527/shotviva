import 'server-only'

import { AppError } from '@/core/errors'
import { OPENROUTER_BASE_URL, openRouterImageParameters, type OpenRouterImageParameters } from '@/core/providers'
import { ProviderError, type GenerationProvider, type ProviderInput } from '@/core/jobs'

import { readOpenRouterOutput } from './openrouter-response'

type OpenRouterImageConfig = {
  apiKey: string
  model: string
  fetch?: typeof fetch
  baseUrl?: string
}

const IMAGE_SIZE = { '1k': '1K', '2k': '2K', '3k': '4K' } as const

function referenceImages(images: ProviderInput['images'], range: OpenRouterImageParameters['input_references']) {
  const max = range?.max ?? 0
  if (images.length > max) {
    throw new AppError('REFERENCE_IMAGE_LIMIT', `This model accepts at most ${max} reference images; received ${images.length}.`)
  }
  if (images.length < (range?.min ?? 0)) {
    throw new AppError('MODEL_INPUT_UNSUPPORTED', 'This model requires more reference images.')
  }
  if (!images.length) return undefined
  return images.map(({ bytes, contentType }) => ({
    type: 'image_url',
    image_url: { url: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}` },
  }))
}

function aspectRatio(requested: string, supported: OpenRouterImageParameters['aspect_ratio']) {
  if (!supported) return undefined
  if (requested === 'original') return supported.values.includes('auto') ? 'auto' : undefined
  if (supported.values.includes(requested)) return requested
  throw new AppError('MODEL_INPUT_UNSUPPORTED', 'This model does not support the selected aspect ratio.')
}

function imageRequest(model: string, input: ProviderInput, supported: OpenRouterImageParameters) {
  const resolution = IMAGE_SIZE[input.resolution]
  if (supported.resolution && !supported.resolution.values.includes(resolution)) {
    throw new AppError('MODEL_INPUT_UNSUPPORTED', 'This model does not support the selected resolution.')
  }
  return {
    model,
    prompt: input.prompt,
    resolution: supported.resolution ? resolution : undefined,
    aspect_ratio: aspectRatio(input.aspectRatio, supported.aspect_ratio),
    output_format: supported.output_format?.values.includes('png') ? 'png' : undefined,
    input_references: referenceImages(input.images, supported.input_references),
  }
}

export function createOpenRouterImageProvider(config: OpenRouterImageConfig): GenerationProvider {
  return {
    id: 'openrouter-image',
    async generate(input) {
      const baseUrl = config.baseUrl ?? OPENROUTER_BASE_URL
      let response: Response
      try {
        input.signal.throwIfAborted()
        const supported = await openRouterImageParameters(baseUrl, config.model, config.fetch)
        input.signal.throwIfAborted()
        response = await (config.fetch ?? fetch)(`${baseUrl}/images`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://shotviva.com',
            'X-Title': 'Shotviva',
          },
          body: JSON.stringify(imageRequest(config.model, input, supported)),
          signal: input.signal,
          redirect: 'error',
          cache: 'no-store',
        })
      } catch (error) {
        if (input.signal.aborted) throw new ProviderError('timeout', 'openrouter request aborted at deadline')
        if (error instanceof AppError && (error.code === 'REFERENCE_IMAGE_LIMIT' || error.code === 'MODEL_INPUT_UNSUPPORTED')) throw error
        throw new ProviderError('failed', 'openrouter request failed')
      }
      return readOpenRouterOutput(response, input, config.model)
    },
  }
}
