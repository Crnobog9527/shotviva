import { describe, expect, it, vi } from 'vitest'

import { ProviderError, type ProviderInput } from '@/core/jobs'

import { createOpenAIImageProvider } from './openai-image-provider'

const PROMPT = 'SECRET-WRAPPED-PROMPT keep the plate unchanged'
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')

const input = (overrides: Partial<ProviderInput> = {}): ProviderInput => ({
  prompt: PROMPT,
  images: [{ bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' }],
  aspectRatio: '4:5',
  resolution: '1k',
  quality: 'high',
  params: {},
  signal: new AbortController().signal,
  ...overrides,
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function provider(fetchImpl: typeof fetch, model = 'gpt-image-2.5-sunburst') {
  return createOpenAIImageProvider({ apiKey: 'sk-test', model, fetch: fetchImpl })
}

const bodies = (fetchImpl: ReturnType<typeof vi.fn>) => fetchImpl.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1].body)

describe('openai image provider', () => {
  it('sends a multipart edit with the photo and returns the PNG', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }))
    const output = await provider(fetchImpl).generate(input({ params: { foo: 1 } }))
    expect(output.contentType).toBe('image/png')
    expect([...output.bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2.5-sunburst')
    expect(form.get('size')).toBe('912x1136')
    expect(form.get('quality')).toBe('high')
    expect(form.get('output_format')).toBe('png')
    expect(form.get('foo')).toBeNull()
    expect(form.get('image')).toBeInstanceOf(Blob)
  })

  it('uses the generations endpoint when there is no photo', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }))
    await provider(fetchImpl).generate(input({ images: [] }))
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/generations')
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'gpt-image-2.5-sunburst', n: 1, size: '912x1136' })
  })

  it('sends the template quality, not model_params, and sizes by tier × ratio', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }))
    await provider(fetchImpl).generate(input({ quality: 'medium', resolution: '3k', aspectRatio: '16:9', params: { quality: 'low' } }))
    const form = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(form.get('quality')).toBe('medium')
    expect(form.get('size')).toBe('3840x2160')
  })

  it("follows the photo's own ratio for 'original'", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }))
    const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg', width: 2048, height: 1536 }
    await provider(fetchImpl).generate(input({ aspectRatio: 'original', resolution: '2k', images: [photo] }))
    const form = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(form.get('size')).toBe('2352x1760')
  })

  it('maps a safety refusal to content_rejected and other errors to failed, without the prompt', async () => {
    const refusal = vi.fn(async () => json({ error: { code: 'moderation_blocked', message: `Rejected: ${PROMPT}` } }, 400))
    const error = await provider(refusal).generate(input()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ kind: 'content_rejected' })
    expect(String((error as Error).message)).not.toContain('SECRET')

    const outage = vi.fn(async () => json({ error: { code: null, type: 'server_error' } }, 503))
    await expect(provider(outage).generate(input())).rejects.toMatchObject({ kind: 'failed' })
    const empty = vi.fn(async () => json({ data: [] }))
    await expect(provider(empty).generate(input())).rejects.toMatchObject({ kind: 'failed' })
  })

  it('reports an aborted request as a timeout', async () => {
    const controller = new AbortController()
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    )
    const pending = provider(hang as typeof fetch).generate(input({ signal: controller.signal }))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' })
  })
})

describe('openai image provider config (T17)', () => {
  it("ignores a template's model_params.model and calls the configured base URL (T17)", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }))
    const relay = createOpenAIImageProvider({ apiKey: 'sk-relay', model: 'gpt-image-2.6', baseUrl: 'https://relay.example.com/v1', fetch: fetchImpl })
    await relay.generate(input({ params: { model: 'gpt-image-2.5-flare', background: 'opaque' } }))
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://relay.example.com/v1/images/edits')
    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-image-2.6')
    expect(form.get('background')).toBe('opaque')
  })
})

describe('openai image provider: photo edits (T30)', () => {
  it('sends input_fidelity on an edit only when the template sets it and the model takes it (T30)', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }))
    await provider(fetchImpl, 'gpt-image-1.5').generate(input({ params: { input_fidelity: 'high' } }))
    await provider(fetchImpl, 'gpt-image-1.5').generate(input())
    await provider(fetchImpl, 'gpt-image-1.5').generate(input({ images: [], params: { input_fidelity: 'high' } }))
    await provider(fetchImpl, 'gpt-image-2.6').generate(input({ params: { input_fidelity: 'high' } }))
    const sent = bodies(fetchImpl)
    expect((sent[0] as FormData).get('input_fidelity')).toBe('high')
    expect((sent[1] as FormData).get('input_fidelity')).toBeNull()
    expect(JSON.parse(sent[2] as string)).not.toHaveProperty('input_fidelity')
    // gpt-image-2 and later reject the field (400 invalid_input_fidelity_model).
    expect((sent[3] as FormData).get('input_fidelity')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  const refused = () => json({ error: { code: 'invalid_input_fidelity_model', type: 'image_generation_user_error', message: 'SECRET' } }, 400)

  it('retries once without input_fidelity when the model refuses it, and returns that image', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(refused()).mockResolvedValueOnce(json({ data: [{ b64_json: PNG_B64 }] }))
    const output = await provider(fetchImpl, 'gpt-image-1.5').generate(input({ params: { input_fidelity: 'high' } }))
    expect([...output.bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const sent = bodies(fetchImpl)
    expect((sent[0] as FormData).get('input_fidelity')).toBe('high')
    expect((sent[1] as FormData).get('input_fidelity')).toBeNull()
    expect((sent[1] as FormData).get('prompt')).toBe(PROMPT)
  })

  it('fails with the second answer when the retry fails too, and retries nothing else', async () => {
    const twice = vi.fn<typeof fetch>().mockResolvedValueOnce(refused()).mockResolvedValueOnce(json({ error: { code: null, type: 'server_error' } }, 500))
    await expect(provider(twice, 'gpt-image-1.5').generate(input({ params: { input_fidelity: 'high' } }))).rejects.toMatchObject({
      kind: 'failed',
      message: 'openai 500 code=- type=server_error',
    })
    expect(twice).toHaveBeenCalledTimes(2)

    // Without input_fidelity in the request, the same 400 is just a failure.
    const once = vi.fn<typeof fetch>().mockResolvedValue(refused())
    await expect(provider(once).generate(input())).rejects.toMatchObject({ kind: 'failed', message: 'openai 400 code=invalid_input_fidelity_model type=image_generation_user_error' })
    expect(once).toHaveBeenCalledTimes(1)
  })
})

describe('openai image provider usage (T33)', () => {
  const usage = { input_tokens: 1600, input_tokens_details: { text_tokens: 100, image_tokens: 1500 }, output_tokens: 4160, total_tokens: 5760 }

  it('returns the reported usage with the image', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }], usage }))
    const output = await provider(fetchImpl).generate(input())
    expect(output.usage).toEqual({ input_text_tokens: 100, input_image_tokens: 1500, output_tokens: 4160 })
  })

  it('returns null usage when the response carries none', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ b64_json: PNG_B64 }] }))
    expect((await provider(fetchImpl).generate(input())).usage).toBeNull()
  })

  it('keeps the usage on the error when a billed response has no image', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [], usage }))
    const error = await provider(fetchImpl).generate(input()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ kind: 'failed', usage: { input_text_tokens: 100, output_tokens: 4160 } })
  })
})
