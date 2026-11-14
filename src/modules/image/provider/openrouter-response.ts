import 'server-only'

import { z } from 'zod'

import { ProviderError, type ProviderInput, type ProviderOutput, type ProviderUsage } from '@/core/jobs'
import { reportedUsage } from './openrouter-receipt'

import { pngFromBase64 } from './image-output'

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
    return { bytes: await pngFromBase64(image.b64_json, image.media_type, input), contentType: 'image/png', usage }
  } catch {
    throw new ProviderError('failed', 'openrouter returned an unusable image', { usage })
  }
}
