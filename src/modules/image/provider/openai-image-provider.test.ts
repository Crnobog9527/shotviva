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

function provider(fetchImpl: typeof fetch) {
  return createOpenAIImageProvider({ apiKey: 'sk-test', model: 'gpt-image-2.5-sunburst', fetch: fetchImpl })
}

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
