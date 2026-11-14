import { describe, expect, it, vi } from 'vitest'

import { createOpenAIResponsesClassifier } from './openai-responses'

const input = { imageDataUrl: 'data:image/jpeg;base64,AA==', instruction: '背景换成海边', instructions: 'CLASSIFY-INSTRUCTIONS', signal: new AbortController().signal }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const reply = (answer: unknown, usage: unknown = { input_tokens: 812, output_tokens: 37, total_tokens: 849 }) =>
  json({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }], usage })

function classifier(fetchImpl: typeof fetch) {
  return createOpenAIResponsesClassifier({ apiKey: 'sk-test', model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1', fetch: fetchImpl }, 'row/gpt-6-luna')
}

const good = { scope: 'background', confidence: 0.93, keep: ['amber glass bottle', 'white label text'], change: 'Replace the background with a beach.', identity_swap: false }

describe('openai responses classifier', () => {
  it('sends the low-detail photo, the words as typed and a strict schema at the lowest effort', async () => {
    const fetchImpl = vi.fn(async () => reply(good))
    await classifier(fetchImpl).classify(input)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      instructions: 'CLASSIFY-INSTRUCTIONS',
      reasoning: { effort: 'none' },
      store: false,
      input: [{ role: 'user', content: [{ type: 'input_image', image_url: input.imageDataUrl, detail: 'low' }, { type: 'input_text', text: '背景换成海边' }] }],
      text: { format: { type: 'json_schema', strict: true } },
    })
    expect(body.text.format.schema.properties.scope.enum).toEqual(['object', 'background', 'style', 'subject', 'global'])
    expect(body.text.format.schema.required).toEqual(['scope', 'confidence', 'keep', 'change', 'identity_swap'])
  })

  it('returns the answer and the token usage', async () => {
    expect(await classifier(vi.fn(async () => reply({ ...good, identity_swap: true }))).classify(input)).toEqual({
      scope: good.scope,
      confidence: good.confidence,
      keep: good.keep,
      change: good.change,
      identitySwap: true,
      usage: { inputTokens: 812, outputTokens: 37 },
    })
  })

  it('caps keep at 8 and clamps confidence into 0–1', async () => {
    const many = { ...good, confidence: 1.4, keep: Array.from({ length: 12 }, (_, i) => `item ${i}`) }
    const answer = await classifier(vi.fn(async () => reply(many, null))).classify(input)
    expect(answer.keep).toHaveLength(8)
    expect(answer.confidence).toBe(1)
    expect(answer.usage).toBeNull()
  })

  it('throws on a refusal, an unknown scope and an error status, with the status only', async () => {
    const refusal = json({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] })
    await expect(classifier(vi.fn(async () => refusal)).classify(input)).rejects.toThrow(/no output_text/)
    await expect(classifier(vi.fn(async () => reply({ ...good, scope: 'overall' }))).classify(input)).rejects.toThrow()
    const error = (await classifier(vi.fn(async () => json({ error: { message: 'echo 背景换成海边' } }, 429))).classify(input).catch((e: unknown) => e)) as Error
    expect(error.message).toBe('openai responses 429')
  })
})
