import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import type { ProviderInput } from '@/core/jobs'
import { logger } from '@/core/logger'

import { createOpenRouterImageProvider } from './openrouter-image-provider'

const config = { apiKey: 'test-key', model: 'google/gemini-2.5-flash-image' }
const usage = { prompt_tokens: 9, completion_tokens: 20, cost: 0.04 }
const photo = { bytes: new Uint8Array([1, 2]), contentType: 'image/jpeg' }
const input = (overrides: Partial<ProviderInput> = {}): ProviderInput => ({
  prompt: 'fixture', images: [photo], aspectRatio: '4:3', resolution: '1k', quality: 'medium', params: {},
  signal: new AbortController().signal, ...overrides,
})

async function imageData(format: 'jpeg' | 'png', edge = 2) {
  const bytes = await sharp({ create: { width: edge, height: edge, channels: 3, background: 'white' } }).toFormat(format).toBuffer()
  return { b64_json: bytes.toString('base64'), media_type: `image/${format}` }
}

const reply = (image: { b64_json: string; media_type?: string }) => ({ data: [image], usage })
const gemini = config.model
const flux = 'black-forest-labs/flux-3-image-klein'
const seedream = 'bytedance-seed/seedream-5-0-lite'
const enumOf = (...values: string[]) => ({ type: 'enum', values })
const range = (max: number) => ({ type: 'range', min: 0, max })
const catalogue = { data: [
  { id: gemini, supported_parameters: { aspect_ratio: enumOf('1:1', '4:3'), input_references: range(3) } },
  { id: flux, supported_parameters: {
    resolution: enumOf('1K', '2K', '4K'), aspect_ratio: enumOf('auto', '4:3', '1:1'),
    output_format: enumOf('jpeg', 'png'), input_references: range(10),
  } },
  { id: seedream, supported_parameters: {
    resolution: enumOf('2K', '4K'), aspect_ratio: enumOf('auto', '4:3'), input_references: range(14),
  } },
  { id: 'openai/gpt-image', supported_parameters: { output_format: enumOf('png'), input_references: range(16) } },
] }

const fake = (body: unknown, status = 200) => vi.fn<typeof fetch>(async (url) =>
  String(url).endsWith('/images/models') ? Response.json(catalogue) : Response.json(body, { status }))

describe('OpenRouter image requests', () => {
  it.each([
    [gemini, 'original', {}],
    [gemini, '4:3', { aspect_ratio: '4:3' }],
    [flux, 'original', { aspect_ratio: 'auto', resolution: '2K', output_format: 'png' }],
    [seedream, 'original', { aspect_ratio: 'auto', resolution: '2K' }],
    ['openai/gpt-image', 'original', { output_format: 'png' }],
  ] as const)('uses only supported parameters for %s (%s)', async (model, aspectRatio, params) => {
    const fetch = fake(reply(await imageData('jpeg')))
    const result = await createOpenRouterImageProvider({ ...config, model, fetch }).generate(input({
      images: [photo, { bytes: new Uint8Array([3, 4]), contentType: 'image/webp' }],
      aspectRatio, resolution: model === gemini ? '1k' : '2k', params: { output_format: 'png' },
    }))
    expect(fetch.mock.calls[0]).toMatchObject(['https://openrouter.ai/api/v1/images/models', { method: 'GET' }])
    const [url, request] = fetch.mock.calls[1]!
    expect(url).toBe('https://openrouter.ai/api/v1/images')
    expect(request).toMatchObject({ method: 'POST', headers: {
      Authorization: 'Bearer test-key', 'HTTP-Referer': 'https://shotviva.com', 'X-Title': 'Shotviva', 'Content-Type': 'application/json',
    } })
    expect(JSON.parse(String(request?.body))).toEqual({
      model, prompt: 'fixture', ...params,
      input_references: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQI=' } },
        { type: 'image_url', image_url: { url: 'data:image/webp;base64,AwQ=' } },
      ],
    })
    expect(result.usage).toEqual(usage)
    expect((await sharp(result.bytes).metadata()).format).toBe('png')
  })

})

describe('OpenRouter model limits', () => {
  it('accepts three Gemini references and refuses four before a paid request', async () => {
    const fetch = fake(reply(await imageData('png')))
    const provider = createOpenRouterImageProvider({ ...config, fetch })
    await provider.generate(input({ images: Array(3).fill(photo) }))
    await expect(provider.generate(input({ images: Array(4).fill(photo) }))).rejects.toMatchObject({
      code: 'REFERENCE_IMAGE_LIMIT', message: expect.stringMatching(/3.*4/),
    })
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })

  it('fails before sending photos when the catalogue is unavailable', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('SENSITIVE', { status: 503 }))
    await expect(createOpenRouterImageProvider({ ...config, fetch }).generate(input()))
      .rejects.toMatchObject({ kind: 'failed', message: expect.not.stringContaining('SENSITIVE') })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('does not submit an undeclared Seedream resolution', async () => {
    const fetch = fake({})
    await expect(createOpenRouterImageProvider({ ...config, model: seedream, fetch }).generate(input()))
      .rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([['1k', '1K'], ['2k', '2K'], ['3k', '4K']] as const)('maps FLUX %s to %s without a reference', async (resolution, size) => {
    const fetch = fake(reply(await imageData('png')))
    const provider = createOpenRouterImageProvider({ ...config, model: flux, baseUrl: 'https://relay.example/v1', fetch })
    await provider.generate(input({ resolution, aspectRatio: 'original', images: [] }))
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://relay.example/v1/images/models', 'https://relay.example/v1/images'])
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      model: flux, prompt: 'fixture', aspect_ratio: 'auto', resolution: size, output_format: 'png',
    })
  })

  it('shrinks real 4K pixels to the existing square 3K tier', async () => {
    const fetch = fake(reply(await imageData('png', 4096)))
    const image = await createOpenRouterImageProvider({ ...config, fetch }).generate(input({ resolution: '3k', aspectRatio: '1:1' }))
    expect(await sharp(image.bytes).metadata()).toMatchObject({ width: 2880, height: 2880 })
  })
})

describe('OpenRouter image responses', () => {
  it('keeps reported tokens and warns when cost is unavailable', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    try {
      const tokens = { prompt_tokens: 12, completion_tokens: 0 }
      const fetch = fake({ ...reply(await imageData('png')), usage: { ...tokens, cost: null, total_tokens: 12 } })
      const provider = createOpenRouterImageProvider({ ...config, fetch })
      const image = await provider.generate(input())
      expect(await provider.completeUsage!(image.usage!)).toMatchObject({ ...tokens, cost: null })
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
    [200, { error: { code: 400, metadata: { error_type: 'refusal' } } }, 'content_rejected'],
    [200, { data: [] }, 'failed'],
  ] as const)('maps %s errors safely and preserves billed usage (%s)', async (status, body, kind) => {
    const fetch = fake({ ...body, usage }, status)
    await expect(createOpenRouterImageProvider({ ...config, fetch }).generate(input())).rejects.toMatchObject({
      kind, usage, message: expect.not.stringContaining('SENSITIVE'),
    })
  })

  it.each(['https://example.com/file.png', '----', 'YWJj'])('rejects unusable data without fetching it', async (b64_json) => {
    const fetch = fake(reply({ b64_json }))
    await expect(createOpenRouterImageProvider({ ...config, fetch }).generate(input())).rejects.toMatchObject({ kind: 'failed', usage })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('uses the image signature when the server omits media_type', async () => {
    const { b64_json } = await imageData('jpeg')
    const fetch = fake(reply({ b64_json }))
    const result = await createOpenRouterImageProvider({ ...config, fetch }).generate(input())
    expect(await sharp(result.bytes).metadata()).toMatchObject({ format: 'png', width: 2, height: 2 })
  })

  it('recognizes the shared deadline without leaking network errors', async () => {
    const controller = new AbortController()
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('SENSITIVE'))
    controller.abort()
    await expect(createOpenRouterImageProvider({ ...config, fetch }).generate(input({ signal: controller.signal })))
      .rejects.toMatchObject({ kind: 'timeout', message: expect.not.stringContaining('SENSITIVE') })
  })
})

it('sends a style-only request to a model requiring references, and blocks an empty request before POST', async () => {
  const fetch = fake(reply(await imageData('png')))
  const provider = createOpenRouterImageProvider({ ...config, model: flux, fetch, imageParameters: {
    aspect_ratio: { type: 'enum', values: ['auto', '1:1'] }, input_references: { type: 'range', min: 1, max: 1 },
  } })
  await expect(provider.generate(input({ aspectRatio: 'original', photoCount: 0, images: [] })))
    .rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
  expect(fetch).not.toHaveBeenCalled()
  await provider.generate(input({
    aspectRatio: 'original', photoCount: 0, images: [{ ...photo, contentType: 'image/webp', width: 600, height: 900 }],
  }))
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe('https://openrouter.ai/api/v1/images')
  expect(JSON.parse(String(init?.body))).toMatchObject({
    aspect_ratio: '1:1', input_references: [{ type: 'image_url', image_url: { url: 'data:image/webp;base64,AQI=' } }],
  })
})
