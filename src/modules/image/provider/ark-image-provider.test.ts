import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { jobCostUsd, ProviderError, type ProviderInput } from '@/core/jobs'
import { providerUsage } from '@/core/jobs/provider-usage'
import { ARK_MAX_PIXELS, ARK_MIN_PIXELS } from '@/core/providers/ark'

import { arkRequest, arkSize, createArkImageProvider } from './ark-image-provider'

const model = 'doubao-seedream-5-5-261028'
const config = { apiKey: 'test-key', model, cnyPerUsd: 6.72 }
const photo = { bytes: new Uint8Array([1, 2]), contentType: 'image/jpeg', width: 3000, height: 2000 }
const style = { bytes: new Uint8Array([3, 4]), contentType: 'image/webp' }
const input = (overrides: Partial<ProviderInput> = {}): ProviderInput => ({
  prompt: 'private fixture prompt', images: [photo], photoCount: 1, aspectRatio: '4:3', resolution: '1k', quality: 'medium',
  params: {}, signal: new AbortController().signal, ...overrides,
})

async function png(edge = 4) {
  return (await sharp({ create: { width: edge, height: edge, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64')
}

const ok = async (size = '1184x880', usage: unknown = { generated_images: 1, input_images: 1, output_tokens: 4070, total_tokens: 4070 }) =>
  ({ model, created: 1, data: [{ b64_json: await png(), size }], usage })
const fake = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => Response.json(body, { status }))
const sent = (fetch: ReturnType<typeof fake>) => JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as Record<string, unknown>

describe('Ark image requests', () => {
  it('posts JSON to /images/generations with the watermark off and b64 png output', async () => {
    const fetch = fake(await ok())
    await createArkImageProvider({ ...config, fetch }).generate(input())
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' } })
    expect(sent(fetch)).toEqual({
      model, prompt: 'private fixture prompt', image: 'data:image/jpeg;base64,AQI=', size: '1184x880',
      output_format: 'png', response_format: 'b64_json', watermark: false,
    })
  })

  it('sends several images as an array, none for text-only, and never a quality', () => {
    expect(arkRequest(model, input({ images: [photo, style] })).image).toEqual(['data:image/jpeg;base64,AQI=', 'data:image/webp;base64,AwQ='])
    const textOnly = arkRequest(model, input({ images: [], photoCount: 0, aspectRatio: 'original' }))
    expect(textOnly).not.toHaveProperty('image')
    expect(textOnly).not.toHaveProperty('quality')
    expect(textOnly.size).toBe('1024x1024')
  })

  it('passes a transparent background through', () => {
    expect(arkRequest(model, input({ params: { background: 'transparent' } }))).toMatchObject({ background: 'transparent', output_format: 'png' })
    expect(arkRequest(model, input({ params: { background: 'nope' } }))).not.toHaveProperty('background')
  })

  it.each(['1k', '2k'] as const)('keeps every %s size inside Ark’s pixel range', (resolution) => {
    for (const aspectRatio of ['1:1', '16:9', '9:16', '4:5', '3:2', '2:3', '4:3', '3:4']) {
      const { width, height } = arkSize({ resolution, aspectRatio, photoCount: 0, images: [] })
      expect(width * height).toBeGreaterThanOrEqual(ARK_MIN_PIXELS)
      expect(width * height).toBeLessThanOrEqual(ARK_MAX_PIXELS)
    }
  })

  // Evidence for offering the tall poster sizes on Ark: they fit its pixel range as they are.
  it.each(['1k', '2k'] as const)('fits the tall %s poster sizes without raising them', (resolution) => {
    for (const aspectRatio of ['1:2', '1:3']) {
      const { width, height } = arkSize({ resolution, aspectRatio, photoCount: 0, images: [] })
      expect(width * height).toBeGreaterThanOrEqual(ARK_MIN_PIXELS)
      expect(width * height).toBeLessThanOrEqual(ARK_MAX_PIXELS)
    }
  })

  it('follows an extreme original photo ratio without going under the pixel floor', () => {
    const wide = { bytes: new Uint8Array([1]), contentType: 'image/png', width: 9000, height: 1000 }
    const size = arkSize({ resolution: '1k', aspectRatio: 'original', photoCount: 1, images: [wide] })
    expect(size.width * size.height).toBeGreaterThanOrEqual(ARK_MIN_PIXELS)
    expect(size.width).toBeGreaterThan(size.height)
  })

  it('refuses the Max tier before calling Ark', async () => {
    const fetch = fake(await ok())
    await expect(createArkImageProvider({ ...config, fetch }).generate(input({ resolution: '3k' }))).rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('Ark responses and cost', () => {
  it('returns PNG bytes and the per-image list price in yuan and dollars', async () => {
    const result = await createArkImageProvider({ ...config, fetch: fake(await ok()) }).generate(input())
    expect(result.contentType).toBe('image/png')
    // 1 image ≤ 2.61 M pixels (¥0.13) + 1 input image (¥0.05) = ¥0.18 at 6.72.
    expect(result.usage).toEqual({ generated_images: 1, input_images: 1, list_cost_cny: 0.18, cny_per_usd: 6.72, list_cost_usd: 0.026786 })
    expect(providerUsage.parse(result.usage)).toEqual(result.usage)
    expect(jobCostUsd(result.usage, null)).toBe(0.026786)
    expect(result.usage).not.toHaveProperty('cost')
    expect(result.usage).not.toHaveProperty('output_tokens')
  })

  it('prices a 2k image in the upper band', async () => {
    const result = await createArkImageProvider({ ...config, fetch: fake(await ok('2352x1760', { generated_images: 1, input_images: 3 })) })
      .generate(input({ resolution: '2k', images: [photo, style, style] }))
    // ¥0.23 + 3 × ¥0.05 = ¥0.38.
    expect(result.usage).toMatchObject({ list_cost_cny: 0.38, list_cost_usd: 0.056548 })
  })

  it('records counts but no price for a model missing from the table', async () => {
    const result = await createArkImageProvider({ ...config, model: 'doubao-seedream-9-9', fetch: fake(await ok()) }).generate(input())
    expect(result.usage).toEqual({ generated_images: 1, input_images: 1 })
    expect(jobCostUsd(result.usage, null)).toBeNull()
  })

  it.each([
    ['InputImageSensitiveContentDetected.PrivacyInformation', 'content_rejected'],
    ['OutputImageSensitiveContentDetected.DeepFake', 'content_rejected'],
    ['InputTextSensitiveContentDetected', 'content_rejected'],
    ['InputTextRiskDetection', 'content_rejected'],
    ['InvalidParameter', 'failed'],
  ] as const)('maps 400 %s to %s without the vendor message', async (code, kind) => {
    const fetch = fake({ error: { code, message: 'echo: private fixture prompt' } }, 400)
    const error = await createArkImageProvider({ ...config, fetch }).generate(input()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ kind, message: `ark image request failed (HTTP 400 code=${code})`, usage: null })
    expect(String((error as Error).message)).not.toContain('private')
  })

  it.each([
    [429, 'ModelAccountIpmRateLimitExceeded', 'failed'],
    [403, 'AccountOverdueError', 'failed'],
    [500, 'InternalServiceError', 'failed'],
    [504, 'GatewayTimeout', 'timeout'],
  ] as const)('maps HTTP %i %s to %s', async (status, code, kind) => {
    const error = await createArkImageProvider({ ...config, fetch: fake({ error: { code } }, status) }).generate(input()).catch((e: unknown) => e)
    expect(error).toMatchObject({ kind, message: `ark image request failed (HTTP ${status} code=${code})` })
  })

  it('fails a 200 without an image and keeps the reported counts', async () => {
    const error = await createArkImageProvider({ ...config, fetch: fake({ data: [], usage: { generated_images: 0, input_images: 1 } }) })
      .generate(input()).catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'failed', usage: { generated_images: 0, input_images: 1 } })
  })

  it('rejects bytes that are not an image', async () => {
    const body = { data: [{ b64_json: Buffer.from('not an image').toString('base64'), size: '1184x880' }], usage: { generated_images: 1 } }
    await expect(createArkImageProvider({ ...config, fetch: fake(body) }).generate(input())).rejects.toMatchObject({ kind: 'failed' })
  })

  it('turns an abort at the deadline into a timeout', async () => {
    const controller = new AbortController()
    const aborting = vi.fn<typeof fetch>(async () => { controller.abort(); throw new DOMException('aborted', 'AbortError') })
    await expect(createArkImageProvider({ ...config, fetch: aborting }).generate(input({ signal: controller.signal }))).rejects.toMatchObject({ kind: 'timeout' })
  })
})
