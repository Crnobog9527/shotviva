import 'server-only'

import sharp from 'sharp'
import { z } from 'zod'

import { ProviderError, type ProviderInput, type ProviderOutput, type ProviderUsage } from '@/core/jobs'
import { logger } from '@/core/logger'
import { sniffImageType } from '@/core/storage'

import { outputSize } from './output-size'

const tokens = z.number().int().nonnegative().optional().catch(undefined)
const usageSchema = z.object({
  prompt_tokens: tokens,
  completion_tokens: tokens,
  cost: z.number().nonnegative().optional().catch(undefined),
})
const errorSchema = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  metadata: z.object({ error_type: z.string().optional(), reasons: z.array(z.string()).optional() }).nullish(),
})
const choiceSchema = z.object({
  finish_reason: z.string().nullish(),
  error: errorSchema.nullish(),
  message: z.object({ images: z.array(z.object({ image_url: z.object({ url: z.string() }) })).nullish() }).nullish(),
})
const responseSchema = z.object({
  usage: usageSchema.nullish().catch(undefined),
  error: errorSchema.nullish(),
  data: z.array(z.object({ b64_json: z.string().min(1), media_type: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional() })).nullish().catch(undefined),
  choices: z.array(choiceSchema).nullish().catch(undefined),
})
const REFUSALS = new Set(['moderation_blocked', 'content_policy_violation', 'image_content_policy_violation', 'refusal'])

type UpstreamError = z.infer<typeof errorSchema>
type UpstreamResponse = z.infer<typeof responseSchema>

function isRefusal(error?: UpstreamError | null) {
  const type = error?.metadata?.error_type ?? String(error?.code)
  return REFUSALS.has(type) || Boolean(error?.metadata?.reasons?.length)
}

function providerFailure(status: number, error: UpstreamError | null | undefined, usage: ProviderUsage | null | undefined) {
  if (isRefusal(error)) return new ProviderError('content_rejected', 'openrouter declined image content', { usage })
  const httpCode = typeof error?.code === 'number' ? error.code : status
  const timeout = httpCode === 408 || httpCode === 504 || error?.metadata?.error_type === 'timeout'
  // Vendor error messages and moderation metadata may quote a private prompt.
  return new ProviderError(timeout ? 'timeout' : 'failed', `openrouter image request failed (HTTP ${httpCode})`, { usage })
}

function imageURL(choice: z.infer<typeof choiceSchema> | undefined, usage: ProviderUsage | null | undefined) {
  if (choice?.finish_reason === 'content_filter') throw new ProviderError('content_rejected', 'openrouter declined image content', { usage })
  const url = choice?.message?.images?.[0]?.image_url.url
  if (!url) throw new ProviderError('failed', 'openrouter returned no image', { usage })
  return url
}

// The dedicated Image API returns raw base64. PNG is explicitly requested.
function outputURL(parsed: UpstreamResponse) {
  const image = parsed.data?.[0]
  if (image) return `data:${image.media_type ?? 'image/png'};base64,${image.b64_json}`
  return imageURL(parsed.choices?.[0], parsed.usage)
}

function extractImage(response: Response, parsed: UpstreamResponse, model: string) {
  const usage = parsed.usage
  const choice = parsed.choices?.[0]
  const error = parsed.error ?? choice?.error
  // Error responses can also report billable usage (e.g. a late provider failure).
  if (usage?.cost === undefined && (usage || response.ok)) {
    logger.warn('openrouter omitted cost; using token pricing when available', { model })
  }
  if (!response.ok || error) throw providerFailure(response.status, error, usage)
  return { usage, url: outputURL(parsed) }
}

async function normalizeOutput(url: string, input: ProviderInput) {
  const mime = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(url)
  if (!mime) throw new Error('invalid image URL')
  const data = url.slice(mime[0].length)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('invalid base64 image')
  const bytes = Buffer.from(data, 'base64')
  if (sniffImageType(bytes) !== mime[1]) throw new Error('invalid image format')
  // All downstream outputs are PNG. Limit decode memory and preserve framing on the 4K → 3K conversion.
  const image = sharp(bytes, { limitInputPixels: 32_000_000 }).rotate()
  if (input.resolution === '3k') {
    image.resize({ ...outputSize('3k', input.aspectRatio, input.images[0]), fit: 'inside', withoutEnlargement: true })
  }
  return image.png().toBuffer()
}

export async function readOpenRouterOutput(response: Response, input: ProviderInput, model: string): Promise<ProviderOutput> {
  const body: unknown = await response.json().catch(() => null)
  if (input.signal.aborted) throw new ProviderError('timeout', 'openrouter request aborted at deadline')
  const parsed = responseSchema.safeParse(body).data ?? {}
  const { usage, url } = extractImage(response, parsed, model)
  try {
    return { bytes: await normalizeOutput(url, input), contentType: 'image/png', usage: usage ?? null }
  } catch {
    throw new ProviderError('failed', 'openrouter returned an unusable image', { usage })
  }
}
