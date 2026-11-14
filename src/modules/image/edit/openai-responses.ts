import 'server-only'

import { z } from 'zod'

import { DECIDED_SCOPES } from '@/core/templates'

import type { ClassifierAnswer, ClassifierInput, ClassifierUsage, ScopeClassifier } from './classifier'

// The 'openai_responses' classifier (ARCHITECTURE §3.3, §5.2): OpenAI's Responses API with a
// strict JSON schema, lowest reasoning effort, nothing stored on OpenAI's side. Plain fetch so
// tests inject a fake. Only the HTTP status leaves on failure: a body can echo the request.

export type OpenAIResponsesConfig = { apiKey: string; model: string; baseUrl: string; fetch?: typeof fetch }

export const KEEP_MAX = 8

// Strict mode wants every property required and no extras; limits are enforced on parse.
const SCHEMA = {
  type: 'object',
  properties: {
    scope: { type: 'string', enum: [...DECIDED_SCOPES] },
    confidence: { type: 'number' },
    keep: { type: 'array', items: { type: 'string' } },
    change: { type: 'string' },
    identity_swap: { type: 'boolean' },
  },
  required: ['scope', 'confidence', 'keep', 'change', 'identity_swap'],
  additionalProperties: false,
} as const

const answerSchema = z.object({
  scope: z.enum(DECIDED_SCOPES),
  confidence: z.number().transform((n) => Math.min(Math.max(n, 0), 1)),
  keep: z.array(z.string().trim().min(1).max(80)).transform((items) => items.slice(0, KEEP_MAX)),
  change: z.string().trim().max(300),
  identity_swap: z.boolean(),
})

const responseSchema = z.object({
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }).nullable().optional(),
})

function requestBody(model: string, input: ClassifierInput) {
  return {
    model,
    instructions: input.instructions,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_image', image_url: input.imageDataUrl, detail: 'low' },
          { type: 'input_text', text: input.instruction },
        ],
      },
    ],
    // The 3 s budget leaves no room for thinking; gpt-6-luna's lowest effort is 'none'.
    reasoning: { effort: 'none' },
    store: false,
    max_output_tokens: 300,
    text: { format: { type: 'json_schema', name: 'edit_scope', strict: true, schema: SCHEMA } },
  }
}

// The JSON text of a Responses API answer and its token usage; shared with the text-only
// identity judge (openai-identity-judge.ts).
export function readResponsesOutput(body: unknown): { json: unknown; usage: ClassifierUsage | null } {
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) throw new Error('openai responses returned an unexpected shape')
  const text = parsed.data.output.flatMap((item) => item.content ?? []).find((part) => part.type === 'output_text')?.text
  // A refusal has no output_text; it is a failure like any other and the edit uses the fallback.
  if (text === undefined) throw new Error('openai responses returned no output_text')
  const usage = parsed.data.usage
  return { json: JSON.parse(text), usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : null }
}

function toAnswer(body: unknown): ClassifierAnswer {
  const { json, usage } = readResponsesOutput(body)
  const { identity_swap: identitySwap, ...answer } = answerSchema.parse(json)
  return { ...answer, identitySwap, usage }
}

// POST {baseUrl}/responses. Only the HTTP status leaves on failure: a body can echo the request.
export async function postResponses(config: OpenAIResponsesConfig, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await (config.fetch ?? fetch)(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`openai responses ${response.status}`)
  }
  return response.json().catch(() => null)
}

export function createOpenAIResponsesClassifier(config: OpenAIResponsesConfig, tag: string): ScopeClassifier {
  return {
    tag,
    async classify(input) {
      return toAnswer(await postResponses(config, requestBody(config.model, input), input.signal))
    },
  }
}
