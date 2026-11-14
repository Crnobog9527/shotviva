import { z } from 'zod'

import type { ProviderUsage } from '@/core/jobs'

// The Images API `usage` object (developers.openai.com/api/reference/resources/images, read
// 2026-11-06): input_tokens with input_tokens_details { text_tokens, image_tokens }, and
// output_tokens. GPT Image 2.x bills its output as image tokens (no separate text-output price on
// the price page), so output_tokens is priced at the image-output rate. A missing or malformed
// part is left out rather than guessed: the job then records what it can and no cost.

const count = z.number().int().nonnegative()

const usageSchema = z.object({
  input_tokens_details: z.object({ text_tokens: count.optional(), image_tokens: count.optional() }).partial().optional().catch(undefined),
  output_tokens: count.optional().catch(undefined),
})

// Drops undefined entries, so a part that was not reported is absent rather than undefined.
function present(usage: ProviderUsage): ProviderUsage {
  return Object.fromEntries(Object.entries(usage).filter(([, value]) => value !== undefined))
}

export function parseOpenAIUsage(body: unknown): ProviderUsage | null {
  if (typeof body !== 'object' || body === null || !('usage' in body)) return null
  const parsed = usageSchema.safeParse(body.usage)
  if (!parsed.success) return null
  const usage = present({
    input_text_tokens: parsed.data.input_tokens_details?.text_tokens,
    input_image_tokens: parsed.data.input_tokens_details?.image_tokens,
    output_tokens: parsed.data.output_tokens,
  })
  return Object.keys(usage).length === 0 ? null : usage
}
