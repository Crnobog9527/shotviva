import 'server-only'

import { z } from 'zod'

import { AppError } from '@/core/errors'
import { ProviderError, type GenerationProvider, type ProviderInput, type ProviderOutput, type ProviderUsage } from '@/core/jobs'
import { ARK_BASE_URL } from '@/core/providers/types'
import { ARK_MAX_PIXELS, ARK_MIN_PIXELS, ARK_RESOLUTIONS } from '@/core/providers/ark'

import { arkListCost, arkPrice } from '@/core/jobs/ark-prices'
import { pngFromBase64 } from './image-output'
import { formatSize, outputSize, sourcePhoto, type OutputSize } from './output-size'

// The 'ark_images' adapter (ARCHITECTURE §3.3): Seedream through Volcano Engine Ark's
// POST {base}/images/generations (https://docs.volcengine.com/docs/82379/1541523). One JSON call
// for text-only and photo requests alike: reference images go in `image` as data URIs. The model
// has no quality setting, so the template's quality is not sent. Ark adds a visible "AI 生成"
// watermark unless told not to, so `watermark: false` is always sent.

export type ArkImageConfig = {
  apiKey: string
  model: string
  // Yuan per US dollar for cost_usd (env CNY_PER_USD).
  cnyPerUsd: number
  fetch?: typeof fetch
  baseUrl?: string
}

// Keys template_prompts.model_params may set. Seedream 5.5 accepts transparent output as PNG.
const paramsSchema = z.object({ background: z.enum(['auto', 'opaque', 'transparent']).optional() })

const STEP = 16

// The tier's size for this ratio, raised to Ark's pixel floor when an extreme 'original' ratio
// comes out smaller (the site's sizes are otherwise all inside Ark's range).
export function arkSize(input: Pick<ProviderInput, 'resolution' | 'aspectRatio' | 'photoCount' | 'images'>): OutputSize {
  if (!ARK_RESOLUTIONS.includes(input.resolution)) {
    throw new AppError('MODEL_INPUT_UNSUPPORTED', `ark_images has no ${input.resolution} tier`)
  }
  const size = outputSize(input.resolution, input.aspectRatio, sourcePhoto(input as ProviderInput))
  const pixels = size.width * size.height
  if (pixels >= ARK_MIN_PIXELS) return size
  const scale = Math.sqrt(ARK_MIN_PIXELS / pixels)
  const width = Math.ceil((size.width * scale) / STEP) * STEP
  const height = Math.ceil((size.height * scale) / STEP) * STEP
  if (width * height > ARK_MAX_PIXELS) throw new AppError('MODEL_INPUT_UNSUPPORTED', 'output size outside the model range')
  return { width, height }
}

function dataUri({ bytes, contentType }: ProviderInput['images'][number]) {
  // Ark wants the format in lower case: data:image/<format>;base64,<data>.
  return `data:${contentType.toLowerCase()};base64,${Buffer.from(bytes).toString('base64')}`
}

export type ArkRequest = {
  model: string; prompt: string; image?: string | string[]; size: string
  output_format: 'png'; response_format: 'b64_json'; watermark: false; background?: 'auto' | 'opaque' | 'transparent'
}

export function arkRequest(model: string, input: ProviderInput): ArkRequest {
  const params = paramsSchema.catch({}).parse(input.params)
  const images = input.images.map(dataUri)
  return {
    model,
    prompt: input.prompt,
    ...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { image: images } : {}),
    size: formatSize(arkSize(input)),
    output_format: 'png',
    response_format: 'b64_json',
    watermark: false,
    ...(params.background ? { background: params.background } : {}),
  }
}

const count = z.number().int().nonnegative().optional().catch(undefined)
const responseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1).optional(), size: z.string().optional() })).nullish().catch(undefined),
  usage: z.object({ generated_images: count, input_images: count }).nullish().catch(undefined),
  error: z.object({ code: z.string().optional() }).nullish().catch({}),
})
type ArkResponse = z.infer<typeof responseSchema>

// Ark's own moderation: input text or image, output image, risk checks. Codes may carry a
// suffix such as InputImageSensitiveContentDetected.PrivacyInformation (a real person's photo).
const REFUSAL = /SensitiveContentDetected|RiskDetection/

function pixelsOf(size: string | undefined, fallback: OutputSize) {
  const match = size ? /^(\d{2,5})x(\d{2,5})$/.exec(size) : null
  return match ? Number(match[1]) * Number(match[2]) : fallback.width * fallback.height
}

function counts(body: ArkResponse, input: ProviderInput, image: boolean) {
  return {
    generatedImages: body.usage?.generated_images ?? (image ? 1 : 0),
    inputImages: body.usage?.input_images ?? input.images.length,
  }
}

// Counts as reported, with the list price in yuan and dollars when the model has one. Ark
// bills only successful images, so a response without one records no price.
function usageOf(body: ArkResponse, input: ProviderInput, config: ArkImageConfig, requested: OutputSize): ProviderUsage | null {
  const image = body.data?.find((entry) => entry.b64_json)
  if (!image && !body.usage) return null
  const { generatedImages, inputImages } = counts(body, input, Boolean(image))
  const usage: ProviderUsage = { generated_images: generatedImages, input_images: inputImages }
  if (generatedImages === 0) return usage
  const cost = arkListCost(arkPrice(config.model), { generatedImages, inputImages, pixels: pixelsOf(image?.size, requested) }, config.cnyPerUsd)
  return cost ? { ...usage, ...cost } : usage
}

// Status and Ark's error code only: its message can quote the prompt.
function failure(status: number, code: string | undefined, usage: ProviderUsage | null) {
  const detail = `ark image request failed (HTTP ${status} code=${code ?? '-'})`
  if (code && REFUSAL.test(code)) return new ProviderError('content_rejected', detail, { usage })
  const timeout = status === 408 || status === 504
  return new ProviderError(timeout ? 'timeout' : 'failed', detail, { usage })
}

async function send(config: ArkImageConfig, input: ProviderInput, request: ArkRequest): Promise<Response> {
  try {
    input.signal.throwIfAborted()
    return await (config.fetch ?? fetch)(`${config.baseUrl ?? ARK_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: input.signal,
      redirect: 'error',
      cache: 'no-store',
    })
  } catch {
    if (input.signal.aborted) throw new ProviderError('timeout', 'ark request aborted at deadline')
    throw new ProviderError('failed', 'ark request failed')
  }
}

// The parsed body and its usage, noted at once so a deadline that wins later keeps the evidence.
async function readBody(response: Response, input: ProviderInput, config: ArkImageConfig, requested: OutputSize) {
  const raw: unknown = await response.json().catch(() => null)
  const body: ArkResponse = responseSchema.safeParse(raw).data ?? {}
  const usage = usageOf(body, input, config, requested)
  if (usage) input.noteUsage?.(usage)
  return { body, usage }
}

async function readOutput(response: Response, input: ProviderInput, config: ArkImageConfig, requested: OutputSize): Promise<ProviderOutput> {
  const { body, usage } = await readBody(response, input, config, requested)
  if (input.signal.aborted) throw new ProviderError('timeout', 'ark request aborted at deadline', { usage })
  if (!response.ok || body.error?.code) throw failure(response.status, body.error?.code, usage)
  const image = body.data?.find((entry) => entry.b64_json)?.b64_json
  if (!image) throw new ProviderError('failed', 'ark returned no image', { usage })
  try {
    return { bytes: await pngFromBase64(image, 'image/png', input), contentType: 'image/png', usage }
  } catch {
    throw new ProviderError('failed', 'ark returned an unusable image', { usage })
  }
}

export function createArkImageProvider(config: ArkImageConfig): GenerationProvider {
  return {
    id: 'ark-image',
    honoursBackground: true,
    async generate(input): Promise<ProviderOutput> {
      const request = arkRequest(config.model, input)
      const response = await send(config, input, request)
      return readOutput(response, input, config, arkSize(input))
    },
  }
}
