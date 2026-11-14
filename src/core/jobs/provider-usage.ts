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
  // Per-image billing (Ark Seedream, ARCHITECTURE §10.0): the counts the vendor reported, the
  // list price from the code table in its own currency, the exchange rate used, and the USD
  // figure that becomes cost_usd. Never under `cost`/`*_tokens`, which mean OpenRouter or tokens.
  generated_images: tokens, input_images: tokens,
  list_cost_cny: usd.optional(), cny_per_usd: z.number().finite().positive().optional(), list_cost_usd: usd.optional(),
})
export type ProviderUsage = z.infer<typeof providerUsage>
