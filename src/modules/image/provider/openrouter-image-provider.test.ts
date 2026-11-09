import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import type { ProviderInput } from '@/core/jobs'
import { logger } from '@/core/logger'
import type { Resolution } from '@/core/templates'

import { createOpenRouterImageProvider } from './openrouter-image-provider'

const config = { apiKey: 'test-key', model: 'google/gemini-2.5-flash-image', resolutions: ['1k'] as const }
const usage = { prompt_tokens: 9, completion_tokens: 20, cost: 0.04 }
const photo = { bytes: new Uint8Array([1, 2]), contentType: 'image/jpeg' }
const input = (overrides: Partial<ProviderInput> = {}): ProviderInput => ({
  prompt: 'fixture', images: [photo], aspectRatio: '4:3', resolution: '1k', quality: 'medium', params: {},
  signal: new AbortController().signal, ...overrides,
})

async function imageURL(format: 'jpeg' | 'png', edge = 2) {
  const bytes = await sharp({ create: { width: edge, height: edge, channels: 3, background: 'white' } }).toFormat(format).toBuffer()
  return `data:image/${format};base64,${bytes.toString('base64')}`
}

const reply = (url: string) => ({ choices: [{ message: { images: [{ image_url: { url } }] } }], usage })
const fake = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }))

describe('OpenRouter image requests', () => {
  it('sends ordered text and photos, the configured ratio and attribution; fixed-size models omit image_size', async () => {
    const fetch = fake(reply(await imageURL('jpeg')))
    const result = await createOpenRouterImageProvider({ ...config, fetch }).generate(input({
      images: [photo, { bytes: new Uint8Array([3, 4]), contentType: 'image/png' }],
      params: { quality: 'low', input_fidelity: 'high', background: 'transparent' },
    }))
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(request).toMatchObject({ method: 'POST', headers: {
      Authorization: 'Bearer test-key', 'HTTP-Referer': 'https://shotviva.com', 'X-Title': 'Shotviva', 'Content-Type': 'application/json',
    } })
    expect(JSON.parse(String(request?.body))).toEqual({
      model: config.model, modalities: ['image', 'text'], usage: { include: true }, image_config: { aspect_ratio: '4:3' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'fixture' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQI=' } },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AwQ=' } },
      ] }],
    })
    expect(result.usage).toEqual(usage)
    expect(result.contentType).toBe('image/png')
    expect((await sharp(result.bytes).metadata()).format).toBe('png')
  })

  it.each([['1k', '1K'], ['2k', '2K'], ['3k', '4K']] as const)('maps %s to %s for variable-size models', async (resolution, size) => {
    const fetch = fake(reply(await imageURL('png')))
    const provider = createOpenRouterImageProvider({ ...config, baseUrl: 'https://relay.example/v1', resolutions: ['1k', '2k', '3k'], fetch })
    await provider.generate(input({ resolution, aspectRatio: 'original', images: [] }))
    expect(fetch.mock.calls[0]?.[0]).toBe('https://relay.example/v1/chat/completions')
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      image_config: { image_size: size }, messages: [{ content: [{ type: 'text' }] }],
    })
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).image_config).not.toHaveProperty('aspect_ratio')
  })

  it('shrinks real 4K pixels to the existing square 3K tier', async () => {
    const fetch = fake(reply(await imageURL('png', 4096)))
    const resolutions: Resolution[] = ['1k', '3k']
    const image = await createOpenRouterImageProvider({ ...config, fetch, resolutions }).generate(input({ resolution: '3k', aspectRatio: '1:1' }))
    expect(await sharp(image.bytes).metadata()).toMatchObject({ width: 2880, height: 2880 })
  })
})

describe('OpenRouter image responses', () => {
  it('keeps reported tokens and warns when cost is unavailable', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    try {
      const tokens = { prompt_tokens: 12, completion_tokens: 0 }
      const fetch = fake({ ...reply(await imageURL('png')), usage: { ...tokens, cost: null, total_tokens: 12 } })
      const image = await createOpenRouterImageProvider({ ...config, fetch }).generate(input())
      expect(image.usage).toEqual(tokens)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('omitted cost'), { model: config.model })
    } finally {
      warn.mockRestore()
    }
  })

  it.each([
    [403, { error: { code: 403, metadata: { reasons: ['SENSITIVE'] } } }, 'content_rejected'],
    [403, { error: { code: 403, metadata: { limit_source: 'budget' } } }, 'failed'],
    [429, { error: { code: 429, message: 'SENSITIVE' } }, 'failed'],
    [503, { error: { code: 503 } }, 'failed'],
    [408, { error: { code: 408 } }, 'timeout'],
    [200, { error: { code: 504 } }, 'timeout'],
    [200, { choices: [{ error: { code: 400, metadata: { error_type: 'refusal' } } }] }, 'content_rejected'],
    [200, { choices: [{ finish_reason: 'content_filter' }] }, 'content_rejected'],
    [200, { choices: [] }, 'failed'],
  ] as const)('maps %s errors safely and preserves billed usage (%s)', async (status, body, kind) => {
    const fetch = fake({ ...body, usage }, status)
    await expect(createOpenRouterImageProvider({ ...config, fetch }).generate(input())).rejects.toMatchObject({
      kind, usage, message: expect.not.stringContaining('SENSITIVE'),
    })
  })

  it.each(['https://example.com/file.png', 'data:image/png;base64,----', 'data:image/png;base64,YWJj'])('rejects unusable data without fetching it', async (url) => {
    const fetch = fake(reply(url))
    await expect(createOpenRouterImageProvider({ ...config, fetch }).generate(input())).rejects.toMatchObject({ kind: 'failed', usage })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('recognizes the shared deadline without leaking network errors', async () => {
    const controller = new AbortController()
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('SENSITIVE'))
    controller.abort()
    await expect(createOpenRouterImageProvider({ ...config, fetch }).generate(input({ signal: controller.signal })))
      .rejects.toMatchObject({ kind: 'timeout', message: expect.not.stringContaining('SENSITIVE') })
  })
})

describe('FLUX 3 on the dedicated OpenRouter Image API', () => {
  const model = 'black-forest-labs/flux-3-image-klein'

  it('sends a reference photo with the original ratio and accepts a billed raster response', async () => {
    const raw = (await imageURL('png')).split(',')[1]!
    const fetch = fake({ data: [{ b64_json: raw }], usage })
    const result = await createOpenRouterImageProvider({ ...config, model, fetch }).generate(input({ aspectRatio: 'original' }))
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/images')
    expect(JSON.parse(String(request?.body))).toEqual({
      model, prompt: 'fixture', resolution: '1K', aspect_ratio: 'auto', output_format: 'png',
      input_references: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQI=' } }],
    })
    expect(await sharp(result.bytes).metadata()).toMatchObject({ format: 'png', width: 2, height: 2 })
    expect(result.usage).toEqual(usage)
  })

  it('maps Max to 4K and keeps billed failure usage without resubmitting', async () => {
    const fetch = fake({ data: [], usage })
    const provider = createOpenRouterImageProvider({ ...config, model: 'black-forest-labs/flux-3-image', fetch })
    await expect(provider.generate(input({ images: [], resolution: '3k' }))).rejects.toMatchObject({ kind: 'failed', usage })
    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ aspect_ratio: '4:3', resolution: '4K' })
    expect(body).not.toHaveProperty('input_references')
  })
})
