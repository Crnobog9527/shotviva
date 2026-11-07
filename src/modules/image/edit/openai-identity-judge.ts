import 'server-only'

import { z } from 'zod'

import type { IdentityJudge } from '@/core/identity-guard'

import { postResponses, readResponsesOutput, type OpenAIResponsesConfig } from './openai-responses'

// The text-only face-swap question of ARCHITECTURE §5.1a on the 'decision' row's Responses API
// model: the user's words as typed, no image, strict one-field schema, lowest effort, nothing
// stored at OpenAI. Same row and key as the edit scope call (classifier-provider.ts).

const SCHEMA = {
  type: 'object',
  properties: { identity_swap: { type: 'boolean' } },
  required: ['identity_swap'],
  additionalProperties: false,
} as const

const answerSchema = z.object({ identity_swap: z.boolean() })

function requestBody(model: string, text: string, instructions: string) {
  return {
    model,
    instructions,
    input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
    reasoning: { effort: 'none' },
    store: false,
    max_output_tokens: 20,
    text: { format: { type: 'json_schema', name: 'identity_swap', strict: true, schema: SCHEMA } },
  }
}

export function createOpenAIIdentityJudge(config: OpenAIResponsesConfig, tag: string): IdentityJudge {
  return {
    tag,
    async judge({ text, instructions, signal }) {
      const { json, usage } = readResponsesOutput(await postResponses(config, requestBody(config.model, text, instructions), signal))
      return { identitySwap: answerSchema.parse(json).identity_swap, usage }
    },
  }
}
