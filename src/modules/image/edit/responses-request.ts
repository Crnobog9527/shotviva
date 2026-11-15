import 'server-only'

import type { OpenAIResponsesConfig } from './openai-responses'

// One POST to {baseUrl}/responses for every Responses call (judge, edit scope, poster reading, dish
// reading). They all ask for reasoning.effort 'none' to stay fast, but some models (OpenRouter's
// openai/gpt-6.1-sol, 2026-11-15) refuse to switch reasoning off with a 400. Such a 400 is retried
// once at the lowest effort they take ('low'), and the model is remembered for the process, so
// later calls skip the refused attempt. Only the status and this one reason ever leave: a body can
// echo the request.

export const LOWEST_REASONING = 'low'
const mandatory = new Set<string>()
const keyOf = (config: OpenAIResponsesConfig, body: { model?: unknown }) => `${config.baseUrl}|${String(body.model ?? config.model)}`
const REASONING_MANDATORY = /reasoning is mandatory|cannot be disabled/i

type Body = { model?: unknown; reasoning?: { effort?: unknown } }

const turnsReasoningOff = (body: Body) => body.reasoning?.effort === 'none'
const withLowest = (body: Body): Body => ({ ...body, reasoning: { ...body.reasoning, effort: LOWEST_REASONING } })

export class ResponsesError extends Error {}

function send(config: OpenAIResponsesConfig, body: Body, signal: AbortSignal, accept?: string) {
  return (config.fetch ?? fetch)(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...(accept ? { Accept: accept } : {}) },
    body: JSON.stringify(body),
    signal,
  })
}

// Whether a refused request was refused for turning reasoning off. Reads at most a little text.
async function refusedReasoningOff(response: Response, body: Body): Promise<boolean> {
  if (response.status !== 400 || !turnsReasoningOff(body)) {
    await response.body?.cancel().catch(() => undefined)
    return false
  }
  const text = await response.text().catch(() => '')
  return REASONING_MANDATORY.test(text.slice(0, 4000))
}

// The answer as a Response (ok, with a body), or a ResponsesError naming the status only.
export async function postResponsesRequest(config: OpenAIResponsesConfig, request: unknown, signal: AbortSignal, accept?: string): Promise<Response> {
  const key = keyOf(config, request as Body)
  const body = mandatory.has(key) && turnsReasoningOff(request as Body) ? withLowest(request as Body) : (request as Body)
  const response = await send(config, body, signal, accept)
  if (response.ok && response.body) return response
  if (!(await refusedReasoningOff(response, body))) throw new ResponsesError(`openai responses ${response.status}`)
  mandatory.add(key)
  const retried = await send(config, withLowest(body), signal, accept)
  if (retried.ok && retried.body) return retried
  await retried.body?.cancel().catch(() => undefined)
  throw new ResponsesError(`openai responses ${retried.status} (reasoning mandatory, retried at ${LOWEST_REASONING})`)
}

// For tests: forget the models learned so far.
export const forgetReasoningModels = () => mandatory.clear()
