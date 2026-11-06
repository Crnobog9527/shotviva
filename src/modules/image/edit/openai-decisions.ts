import 'server-only'

import { z } from 'zod'

import { DECIDED_SCOPES, type DecidedScope } from '@/core/templates'

import type { DecisionInput, ScopeDecider, ScopeProbabilities } from './decision'

// The 'openai_decisions' adapter (ARCHITECTURE §3.3, §5.2): OpenAI's POST /v1/decisions with
// predicate questions only (choice questions lean on option order). Answers come back in
// question order; a refusal answers that one question with null. Plain fetch so tests inject a
// fake. Only the HTTP status leaves on failure: a body can echo the request.

export type OpenAIDecisionsConfig = { apiKey: string; model: string; baseUrl: string; fetch?: typeof fetch }

const answerSchema = z.object({
  type: z.string(),
  name: z.string().nullable().optional(),
  probability: z.number().min(0).max(1).optional(),
})
const responseSchema = z.object({ answers: z.array(answerSchema) })

function requestBody(model: string, input: DecisionInput) {
  return {
    model,
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_image', image_url: input.imageDataUrl, detail: 'low' },
          { type: 'input_text', text: input.instruction },
        ],
      },
    ],
    questions: input.questions.map((question) => ({ type: 'predicate', name: question.scope, instructions: question.text })),
  }
}

function toProbabilities(input: DecisionInput, answers: z.infer<typeof answerSchema>[]): ScopeProbabilities {
  const result = Object.fromEntries(DECIDED_SCOPES.map((scope) => [scope, null])) as ScopeProbabilities
  input.questions.forEach((question, index) => {
    const answer = answers.find((a) => a.name === question.scope) ?? answers[index]
    result[question.scope as DecidedScope] = answer?.type === 'predicate' && answer.probability !== undefined ? answer.probability : null
  })
  return result
}

export function createOpenAIDecisions(config: OpenAIDecisionsConfig, tag: string): ScopeDecider {
  return {
    tag,
    async decide(input) {
      const response = await (config.fetch ?? fetch)(`${config.baseUrl}/decisions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody(config.model, input)),
        signal: input.signal,
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error(`openai decisions ${response.status}`)
      }
      const parsed = responseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) throw new Error('openai decisions returned an unexpected shape')
      return toProbabilities(input, parsed.data.answers)
    },
  }
}
