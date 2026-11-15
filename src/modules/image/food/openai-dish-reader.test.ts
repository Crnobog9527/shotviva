import { describe, expect, it, vi } from 'vitest'

import { createOpenAIDishReader, DISH_READING_SCHEMA } from './openai-dish-reader'

const answer = {
  dish_name: 'Fish', main_ingredients: [], sauce: '', garnish: [], dishware: 'plate', category: 'long',
}

describe('the dish reader on the decision row (§5.1c)', () => {
  it('sends the photo with a strict schema and nothing stored, and reads the answer and its tokens', async () => {
    const fetch = vi.fn(async () => Response.json({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }],
      usage: { input_tokens: 800, output_tokens: 90 },
    }))
    const reader = createOpenAIDishReader({ apiKey: 'k', model: 'openai/gpt-6-luna', baseUrl: 'https://openrouter.ai/api/v1', fetch }, 'row/luna')
    const out = await reader.read({ imageDataUrl: 'data:image/jpeg;base64,AA==', instructions: 'READ', signal: AbortSignal.timeout(1000) })
    expect(out).toEqual({ reading: answer, usage: { inputTokens: 800, outputTokens: 90 } })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/responses')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ model: 'openai/gpt-6-luna', instructions: 'READ', store: false })
    expect(body.input[0].content[0]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,AA==', detail: 'high' })
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true, schema: DISH_READING_SCHEMA })
  })

  it('fails on an answer outside the schema, so the flow falls back', async () => {
    const fetch = vi.fn(async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"dish_name":1}' }] }] }))
    const reader = createOpenAIDishReader({ apiKey: 'k', model: 'm', baseUrl: 'https://x.test', fetch }, 't')
    await expect(reader.read({ imageDataUrl: 'd', instructions: 'R', signal: AbortSignal.timeout(1000) })).rejects.toThrow()
  })
})
