import 'server-only'

import sharp from 'sharp'
import { z } from 'zod'

import { ProviderError, type ProviderInput, type ProviderOutput, type ProviderUsage } from '@/core/jobs'
import { reportedUsage } from './openrouter-receipt'
import { sniffImageType } from '@/core/storage'

import { outputSize, sourcePhoto } from './output-size'

const errorSchema = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  metadata: z.object({ error_type: z.string().optional(), reasons: z.array(z.string()).optional() }).nullish(),
})
const imageSchema = z.object({
  b64_json: z.string().min(1),
  media_type: z.enum(['image/png', 'image/jpeg', 'image/webp']).nullish(),
})
const responseSchema = z.object({
  error: errorSchema.nullish().catch({}),
  data: z.array(imageSchema).nullish().catch(undefined),
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

async function normalizeOutput({ b64_json, media_type }: z.infer<typeof imageSchema>, input: ProviderInput) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64_json)) throw new Error('invalid base64 image')
  const bytes = Buffer.from(b64_json, 'base64')
  const type = sniffImageType(bytes)
  if (!type || type === 'image/heic' || (media_type && type !== media_type)) throw new Error('invalid image format')
  // All downstream outputs are PNG. Limit decode memory and preserve framing when a native 4K output is scaled to the site's 4K size table (2880² at 1:1).
  const image = sharp(bytes, { limitInputPixels: 32_000_000 }).rotate()
  if (input.resolution === '4k') {
    image.resize({ ...outputSize('4k', input.aspectRatio, sourcePhoto(input)), fit: 'inside', withoutEnlargement: true })
  }
  return image.png().toBuffer()
}

export async function readOpenRouterOutput(response: Response, input: ProviderInput): Promise<ProviderOutput> {
  input.noteUsage?.(reportedUsage({}, response.headers))
  const body: unknown = await response.json().catch(() => null)
  const usage = reportedUsage(body, response.headers)
  input.noteUsage?.(usage)
  if (input.signal.aborted) throw new ProviderError('timeout', 'openrouter request aborted at deadline', { usage })
  const parsed: UpstreamResponse = responseSchema.safeParse(body).data ?? {}
  if (!response.ok || parsed.error) throw providerFailure(response.status, parsed.error, usage)
  const image = parsed.data?.[0]
  if (!image) throw new ProviderError('failed', 'openrouter returned no image', { usage })
  try {
    return { bytes: await normalizeOutput(image, input), contentType: 'image/png', usage }
  } catch {
    throw new ProviderError('failed', 'openrouter returned an unusable image', { usage })
  }
}
