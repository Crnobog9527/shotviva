import { z } from 'zod'

import { ProviderError, type GenerationProvider, type ProviderInput, type ProviderOutput } from '@/core/jobs'

import { toProviderError } from './openai-errors'
import { formatSize, outputSize } from './output-size'

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
  // How closely an edit keeps the input photo (T30, ARCHITECTURE §5.2). /images/edits only, and
  // only when the template sets it, since not every model accepts it.
  input_fidelity: z.enum(['high', 'low']).optional(),
})

const responseSchema = z.object({ data: z.array(z.object({ b64_json: z.string().min(1) })).min(1) })

function buildRequest(config: OpenAIImageConfig, input: ProviderInput): { path: string; init: RequestInit } {
  const params = paramsSchema.catch({}).parse(input.params)
  const fields: Record<string, string> = {
    model: config.model,
    prompt: input.prompt,
    size: formatSize(outputSize(input.resolution, input.aspectRatio, input.images[0])),
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
