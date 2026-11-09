import { z } from 'zod'

import { ProviderError, type GenerationProvider, type ProviderInput, type ProviderOutput } from '@/core/jobs'

import { logger } from '@/core/logger'

import { FIDELITY_REJECTED_CODE, fidelityFor } from './input-fidelity'
import { failureToProviderError, readOpenAIFailure } from './openai-errors'
import { parseOpenAIUsage } from './openai-usage'
import { formatSize, outputSize, sourcePhoto } from './output-size'

// The 'openai_images' adapter (ARCHITECTURE §3.2–3.3): OpenAI's Images API shape, at the official
// address or any relay that speaks it. /images/edits when the template takes a photo (the normal
// case: keep the dish, change the scene), /images/generations otherwise. Plain fetch instead of
// the SDK so tests inject a fake and nothing reaches the network.

export type OpenAIImageConfig = {
  apiKey: string
  model: string
  fetch?: typeof fetch
  baseUrl?: string
}

// Keys template_prompts.model_params may set; anything else is ignored. Not `model`: since T17
// the model is the active provider's alone, so no template keeps calling an old one after a
// switch. Not `quality` either: it comes from the template's quality tier, which its price is
// floored on.
const paramsSchema = z.object({
  background: z.enum(['auto', 'opaque', 'transparent']).optional(),
  // How closely an edit keeps the input photo (T30, ARCHITECTURE §5.2). /images/edits only, when
  // the template sets it and the model accepts it (input-fidelity.ts).
  input_fidelity: z.enum(['high', 'low']).optional(),
})

type Params = z.infer<typeof paramsSchema>

const responseSchema = z.object({ data: z.array(z.object({ b64_json: z.string().min(1) })).min(1) })

function buildRequest(config: OpenAIImageConfig, input: ProviderInput, params: Params): { path: string; init: RequestInit } {
  const fields: Record<string, string> = {
    model: config.model,
    prompt: input.prompt,
    size: formatSize(outputSize(input.resolution, input.aspectRatio, sourcePhoto(input))),
    quality: input.quality,
    n: '1',
    output_format: 'png',
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
  if (params.input_fidelity) form.append('input_fidelity', params.input_fidelity)
  const imageField = input.images.length === 1 ? 'image' : 'image[]'
  input.images.forEach((image, index) => {
    const extension = image.contentType === 'image/webp' ? 'webp' : image.contentType === 'image/png' ? 'png' : 'jpg'
    form.append(imageField, new Blob([image.bytes as BlobPart], { type: image.contentType }), `input-${index}.${extension}`)
  })
  return { path: '/images/edits', init: { method: 'POST', headers, body: form } }
}

async function send(config: OpenAIImageConfig, input: ProviderInput, params: Params): Promise<Response> {
  const { path, init } = buildRequest(config, input, params)
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

// Sends the request; if the model still refuses input_fidelity (a relay's model name we do not
// know, or a model that changed), sends it once more without, under the same deadline. The job is
// settled only on the final answer, so the user is charged or refunded once.
async function sendWithFallback(config: OpenAIImageConfig, input: ProviderInput): Promise<Response> {
  const parsed = paramsSchema.catch({}).parse(input.params)
  const params = { ...parsed, input_fidelity: fidelityFor(config.model, parsed.input_fidelity) }
  const response = await send(config, input, params)
  if (response.ok) return response
  const failure = await readOpenAIFailure(response)
  if (!(params.input_fidelity && failure.status === 400 && failure.code === FIDELITY_REJECTED_CODE)) throw failureToProviderError(failure)
  logger.warn('model refused input_fidelity; retrying without it', { model: config.model })
  const retry = await send(config, input, { ...params, input_fidelity: undefined })
  if (!retry.ok) throw failureToProviderError(await readOpenAIFailure(retry))
  return retry
}

export function createOpenAIImageProvider(config: OpenAIImageConfig): GenerationProvider {
  return {
    id: 'openai-image',
    async generate(input): Promise<ProviderOutput> {
      const response = await sendWithFallback(config, input)
      const body: unknown = await response.json().catch(() => null)
      // A 200 without an image is still billed for what it used (T33).
      const usage = parseOpenAIUsage(body)
      const first = responseSchema.safeParse(body).data?.data[0]
      if (!first) throw new ProviderError('failed', 'openai returned no image', { usage })
      return { bytes: new Uint8Array(Buffer.from(first.b64_json, 'base64')), contentType: 'image/png', usage }
    },
  }
}
