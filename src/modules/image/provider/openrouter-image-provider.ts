import 'server-only'

import { AppError } from '@/core/errors'
import { OPENROUTER_BASE_URL, OPENROUTER_IMAGE_SIZE, openRouterInputMismatch, openRouterImageParameters, type OpenRouterImageParameters } from '@/core/providers'
import { ProviderError, type GenerationProvider, type ProviderInput } from '@/core/jobs'

import { completeReceipt } from './openrouter-receipt'
import { readOpenRouterOutput } from './openrouter-response'

type OpenRouterImageConfig = {
  apiKey: string
  model: string
  fetch?: typeof fetch
  imageParameters?: OpenRouterImageParameters
  baseUrl?: string
}

function referenceImages(images: ProviderInput['images']) {
  if (!images.length) return undefined
  return images.map(({ bytes, contentType }) => ({
    type: 'image_url',
    image_url: { url: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}` },
  }))
}

function requestedAspect(input: ProviderInput, supported: OpenRouterImageParameters) {
  if (input.aspectRatio !== 'original') return input.aspectRatio
  if (input.photoCount === 0 && input.images.length && supported.aspect_ratio?.values.includes('1:1')) return '1:1'
  return 'auto'
}

function imageRequest(model: string, input: ProviderInput, supported: OpenRouterImageParameters) {
  const mismatch = openRouterInputMismatch(input, supported)
  if (mismatch) {
    throw new AppError(mismatch.reason === 'reference_image_limit' ? 'REFERENCE_IMAGE_LIMIT' : 'MODEL_INPUT_UNSUPPORTED', mismatch.message)
  }
  const aspect = requestedAspect(input, supported)
  return {
    model,
    prompt: input.prompt,
    resolution: supported.resolution ? OPENROUTER_IMAGE_SIZE[input.resolution] : undefined,
    aspect_ratio: supported.aspect_ratio?.values.includes(aspect) ? aspect : undefined,
    output_format: supported.output_format?.values.includes('png') ? 'png' : undefined,
    input_references: referenceImages(input.images),
  }
}

export function createOpenRouterImageProvider(config: OpenRouterImageConfig): GenerationProvider {
  return {
    id: 'openrouter-image',
    completeUsage: usage => completeReceipt(usage, { ...config, baseUrl: config.baseUrl ?? OPENROUTER_BASE_URL }),
    async generate(input) {
      const baseUrl = config.baseUrl ?? OPENROUTER_BASE_URL
      let response: Response
      try {
        input.signal.throwIfAborted()
        const supported = config.imageParameters ?? await openRouterImageParameters(baseUrl, config.model, config.fetch)
        input.signal.throwIfAborted()
        const body = JSON.stringify(imageRequest(config.model, input, supported))
        input.noteUsage?.({ cost: null })
        response = await (config.fetch ?? fetch)(`${baseUrl}/images`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://shotviva.com',
            'X-Title': 'Shotviva',
          },
          body,
          signal: input.signal,
          redirect: 'error',
          cache: 'no-store',
        })
      } catch (error) {
        if (input.signal.aborted) throw new ProviderError('timeout', 'openrouter request aborted at deadline')
        if (error instanceof AppError && (error.code === 'REFERENCE_IMAGE_LIMIT' || error.code === 'MODEL_INPUT_UNSUPPORTED')) throw error
        throw new ProviderError('failed', 'openrouter request failed')
      }
      return readOpenRouterOutput(response, input)
    },
  }
}
