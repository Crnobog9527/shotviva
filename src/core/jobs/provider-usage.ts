import { z } from 'zod'

const tokens = z.number().int().nonnegative().optional()
const usd = z.number().finite().nonnegative()

// Shared by providers and the confirm/refund RPC boundary. Store only known billing
// fields; an explicit null cost means a request was submitted but its charge is unknown.
export const generationId = z.string().regex(/^gen-[a-zA-Z0-9_-]{1,160}$/)
export const providerUsage = z.strictObject({
  prompt_tokens: tokens, completion_tokens: tokens, cost: usd.nullish(),
  is_byok: z.boolean().optional(), generation_id: generationId.optional(),
  upstream_inference_cost: usd.optional(), estimated_cost_usd: usd.optional(), cost_source: z.literal('generation').optional(),
  input_text_tokens: tokens, input_image_tokens: tokens, output_tokens: tokens,
  decision_input_tokens: tokens, decision_output_tokens: tokens,
})
export type ProviderUsage = z.infer<typeof providerUsage>
