import { z } from 'zod'

import { ProviderError, type GenerationProvider, type ProviderInput, type ProviderOutput } from '@/core/jobs'

import { toProviderError } from './openai-errors'
import { outputSizeFor } from './output-size'

// GPT-Image-2.5 via OpenAI's Images API: /v1/images/edits when the template takes a photo
// (the normal case: keep the dish, change the scene), /v1/images/generations otherwise.
// Plain fetch instead of the SDK so tests inject a fake and nothing reaches the network.

export type OpenAIImageConfig = {
  apiKey: string
  model: string
  fetch?: typeof fetch
  baseUrl?: string
}

// Keys template_prompts.model_params may set; anything else is ignored.
const paramsSchema = z.object({
  model: z.string().regex(/^gpt-image-[\w.-]+$/).optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  background: z.enum(['auto', 'opaque', 'transparent']).optional(),
})

const responseSchema = z.object({ data: z.array(z.object({ b64_json: z.string().min(1) })).min(1) })

function buildRequest(config: OpenAIImageConfig, input: ProviderInput): { path: string; init: RequestInit } {
  const params = paramsSchema.catch({}).parse(input.params)
  const fields: Record<string, string> = {
    model: params.model ?? config.model,
    prompt: input.prompt,
    size: outputSizeFor(input.aspectRatio),
    n: '1',
    output_format: 'png',
    ...(params.quality ? { quality: params.quality } : {}),
    ...(params.background ? { background: params.background } : {}),
  }
  const headers = { Authorization: `Bearer ${config.apiKey}` }
  if (input.images.length === 0) {
    return {
      path: '/images/generations',
      init: { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, n: 1 }) },
    }
  }
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  const imageField = input.images.length === 1 ? 'image' : 'image[]'
  input.images.forEach((image, index) => {
    form.append(imageField, new Blob([image.bytes as BlobPart], { type: image.contentType }), `input-${index}.jpg`)
  })
  return { path: '/images/edits', init: { method: 'POST', headers, body: form } }
}

async function send(config: OpenAIImageConfig, input: ProviderInput): Promise<Response> {
  const { path, init } = buildRequest(config, input)
  try {
    return await (config.fetch ?? fetch)(`${config.baseUrl ?? 'https://api.openai.com/v1'}${path}`, {
      ...init,
      signal: input.signal,
    })
  } catch (error) {
    if (input.signal.aborted) throw new ProviderError('timeout', 'openai request aborted at deadline')
    throw new ProviderError('failed', 'openai request failed', { cause: error })
  }
}

export function createOpenAIImageProvider(config: OpenAIImageConfig): GenerationProvider {
  return {
    id: 'openai-image',
    async generate(input): Promise<ProviderOutput> {
      const response = await send(config, input)
      if (!response.ok) throw await toProviderError(response)
      const parsed = responseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) throw new ProviderError('failed', 'openai returned no image')
      const first = parsed.data.data[0]
      if (!first) throw new ProviderError('failed', 'openai returned no image')
      return { bytes: new Uint8Array(Buffer.from(first.b64_json, 'base64')), contentType: 'image/png' }
    },
  }
}
