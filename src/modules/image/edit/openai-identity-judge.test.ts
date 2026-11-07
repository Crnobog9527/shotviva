import { describe, expect, it, vi } from 'vitest'

import { createOpenAIIdentityJudge } from './openai-identity-judge'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const reply = (answer: unknown, usage: unknown = { input_tokens: 431, output_tokens: 7 }) =>
  json({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }], usage })

const input = { text: 'make her look like Taylor Swift', instructions: 'JUDGE-INSTRUCTIONS', signal: new AbortController().signal }

function judge(fetchImpl: typeof fetch) {
  return createOpenAIIdentityJudge({ apiKey: 'sk-test', model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1', fetch: fetchImpl }, 'row/gpt-6-luna')
}

describe('openai identity judge (ARCHITECTURE §5.1a)', () => {
  it('sends the words only, no image, with a one-field strict schema at the lowest effort', async () => {
    const fetchImpl = vi.fn(async () => reply({ identity_swap: true }))
    await judge(fetchImpl).judge(input)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/responses')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      instructions: 'JUDGE-INSTRUCTIONS',
      reasoning: { effort: 'none' },
      store: false,
      input: [{ role: 'user', content: [{ type: 'input_text', text: input.text }] }],
      text: { format: { type: 'json_schema', strict: true, schema: { required: ['identity_swap'] } } },
    })
    expect(JSON.stringify(body.input)).not.toContain('input_image')
  })

  it('returns the answer and the tokens', async () => {
    expect(await judge(vi.fn(async () => reply({ identity_swap: false }))).judge(input)).toEqual({ identitySwap: false, usage: { inputTokens: 431, outputTokens: 7 } })
  })

  it('throws on an error status (status only), a refusal or a malformed answer', async () => {
    const error = (await judge(vi.fn(async () => json({ error: { message: `echo ${input.text}` } }, 500))).judge(input).catch((e: unknown) => e)) as Error
    expect(error.message).toBe('openai responses 500')
    const refusal = json({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] })
    await expect(judge(vi.fn(async () => refusal)).judge(input)).rejects.toThrow(/no output_text/)
    await expect(judge(vi.fn(async () => reply({ identity_swap: 'yes' }))).judge(input)).rejects.toThrow()
  })
})
