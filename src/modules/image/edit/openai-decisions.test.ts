import { describe, expect, it, vi } from 'vitest'

import { createOpenAIDecisions } from './openai-decisions'

const questions = [
  { scope: 'object' as const, text: 'Q-OBJECT' },
  { scope: 'background' as const, text: 'Q-BACKGROUND' },
  { scope: 'style' as const, text: 'Q-STYLE' },
]
const input = { imageDataUrl: 'data:image/jpeg;base64,AA==', instruction: '背景换成海边', questions, signal: new AbortController().signal }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function decisions(fetchImpl: typeof fetch) {
  return createOpenAIDecisions({ apiKey: 'sk-test', model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1', fetch: fetchImpl }, 'row/gpt-6-luna')
}

describe('openai decisions adapter', () => {
  it('asks one predicate per range about the low-detail photo and the words as typed', async () => {
    const fetchImpl = vi.fn(async () => json({ answers: [], model: 'gpt-6-luna' }))
    await decisions(fetchImpl).decide(input)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/decisions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gpt-6-luna',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_image', image_url: input.imageDataUrl, detail: 'low' },
            { type: 'input_text', text: '背景换成海边' },
          ],
        },
      ],
      questions: [
        { type: 'predicate', name: 'object', instructions: 'Q-OBJECT' },
        { type: 'predicate', name: 'background', instructions: 'Q-BACKGROUND' },
        { type: 'predicate', name: 'style', instructions: 'Q-STYLE' },
      ],
    })
  })

  it('reads probabilities by name, a refusal as null and an unasked range as null', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        answers: [
          { type: 'predicate', name: 'object', probability: 0.12 },
          { type: 'predicate', name: 'background', probability: 0.94 },
          { type: 'refusal', name: 'style' },
        ],
      }),
    )
    expect(await decisions(fetchImpl).decide(input)).toEqual({ object: 0.12, background: 0.94, style: null, subject: null, overall: null })
  })

  it('throws with the status only, never the body', async () => {
    const fetchImpl = vi.fn(async () => json({ error: { message: 'echo: 背景换成海边' } }, 429))
    const error = await decisions(fetchImpl).decide(input).catch((e: unknown) => e as Error)
    expect(error.message).toBe('openai decisions 429')
  })

  it('throws on a body that is not a decision', async () => {
    await expect(decisions(vi.fn(async () => json({ nope: true }))).decide(input)).rejects.toThrow(/unexpected shape/)
  })
})
