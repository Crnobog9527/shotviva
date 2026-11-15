import { beforeEach, describe, expect, it, vi } from 'vitest'

import { forgetReasoningModels, postResponsesRequest } from './responses-request'

const MANDATORY = { error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled.', code: 400 } }
const body = (model: string, effort = 'none') => ({ model, input: 'secret words', reasoning: { effort } })
const sent = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).reasoning.effort)

function config(responses: Response[]) {
  const fetch = vi.fn(async () => responses.shift()!)
  return { fetch, config: { apiKey: 'k', model: 'm', baseUrl: 'https://openrouter.ai/api/v1', fetch } }
}

describe('Responses requests and models that cannot turn reasoning off', () => {
  beforeEach(() => forgetReasoningModels())

  it('retries once at the lowest effort, and asks that model at it from then on', async () => {
    const { fetch, config: c } = config([Response.json(MANDATORY, { status: 400 }), Response.json({ ok: 1 }), Response.json({ ok: 2 })])
    expect(await (await postResponsesRequest(c, body('openai/gpt-6.1-sol'), AbortSignal.timeout(1000))).json()).toEqual({ ok: 1 })
    await postResponsesRequest(c, body('openai/gpt-6.1-sol'), AbortSignal.timeout(1000))
    expect(sent(fetch)).toEqual(['none', 'low', 'low'])
  })

  it('leaves other models and other refusals alone, naming only the status', async () => {
    const { fetch, config: c } = config([Response.json({ error: { message: 'secret words are bad' } }, { status: 400 }), Response.json({ ok: 1 })])
    await expect(postResponsesRequest(c, body('openai/gpt-6-luna'), AbortSignal.timeout(1000))).rejects.toThrow(/^openai responses 400$/)
    await postResponsesRequest(c, body('openai/gpt-6-luna'), AbortSignal.timeout(1000))
    expect(sent(fetch)).toEqual(['none', 'none'])
  })

  it('never retries a request that already reasons, and says why a retry failed', async () => {
    const asked = config([Response.json(MANDATORY, { status: 400 })])
    await expect(postResponsesRequest(asked.config, body('m', 'low'), AbortSignal.timeout(1000))).rejects.toThrow(/^openai responses 400$/)
    expect(asked.fetch).toHaveBeenCalledTimes(1)
    const twice = config([Response.json(MANDATORY, { status: 400 }), new Response('nope', { status: 502 })])
    await expect(postResponsesRequest(twice.config, body('x'), AbortSignal.timeout(1000))).rejects.toThrow('openai responses 502 (reasoning mandatory, retried at low)')
  })
})
