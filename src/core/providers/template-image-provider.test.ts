import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerationProvider, ProviderInput } from '../jobs'
import { logger } from '../logger'
import type { OpenRouterImageParameters } from './openrouter-catalog'
import { ProviderSettingError } from './setting-error'
import { templateImageProvider } from './template-image-provider'
import type { ActiveProviderRow, ProviderAdapters } from './types'

const row: ActiveProviderRow = {
  id: 'router', adapter: 'openrouter_images', baseUrl: 'https://openrouter.ai/api/v1',
  model: 'google/gemini-2.5-flash-image', resolutions: ['1k'], prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
}
const supported: OpenRouterImageParameters = {
  aspect_ratio: { type: 'enum', values: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] },
  input_references: { type: 'range', min: 0, max: 3 },
}
const defaultProvider: GenerationProvider = { id: 'default/openai-test', generate: vi.fn() }
const adapters: ProviderAdapters = { openrouter_images: () => ({ id: 'openrouter', generate: vi.fn() }) }
const photo = { bytes: Uint8Array.of(1), contentType: 'image/png' }
const request: Pick<ProviderInput, 'resolution' | 'aspectRatio' | 'images'> = {
  resolution: '1k', aspectRatio: '4:5', images: [photo],
}

function dependencies() {
  return {
    lookup: vi.fn(async () => row),
    fallback: vi.fn(async () => defaultProvider),
    readKey: vi.fn(async () => 'test'),
    parameters: vi.fn(async () => supported),
  }
}

afterEach(() => vi.restoreAllMocks())

describe('template image provider', () => {
  it('uses the default without fetching a row when the template follows the default', async () => {
    const deps = dependencies()
    expect(await templateImageProvider(adapters, null, request, deps)).toBe(defaultProvider)
    expect(deps.lookup).not.toHaveBeenCalled()
  })

  it('keeps the selected Gemini model for its advertised 4:5 ratio and up to three references', async () => {
    const deps = dependencies()
    const selected = await templateImageProvider(adapters, row.id, { ...request, images: [photo, photo, photo] }, deps)
    expect(selected.id).toBe(`${row.id}/${row.model}`)
    expect(deps.readKey).toHaveBeenCalledWith(row.id)
    expect(deps.fallback).not.toHaveBeenCalled()
  })

  it.each([
    ['2k', '4:5', 1, 'unsupported_resolution'],
    ['1k', '2:1', 1, 'unsupported_aspect_ratio'],
    ['1k', '4:5', 5, 'reference_image_limit'],
    ['1k', '4:5', 1, 'catalog_unavailable'],
  ] as const)('selects the default before reading the template key (%s, %s, %i, %s)', async (resolution, aspectRatio, count, reason) => {
    const deps = dependencies()
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    if (reason === 'catalog_unavailable') {
      deps.parameters.mockRejectedValueOnce(new ProviderSettingError('openrouter_catalog_unavailable', 'Images catalogue timed out'))
    }
    const selected = await templateImageProvider(adapters, row.id, { resolution, aspectRatio, images: Array(count).fill(photo) }, deps)
    expect(selected).toBe(defaultProvider)
    expect(deps.readKey).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith('image.provider.fallback', expect.objectContaining({
      reason, requestedProvider: `${row.id}/${row.model}`, actualProvider: defaultProvider.id,
    }))
  })

  it('rejects a decision provider submitted directly by the admin client', async () => {
    const deps = dependencies()
    deps.lookup.mockResolvedValue({ ...row, adapter: 'openai_responses' })
    await expect(templateImageProvider(adapters, row.id, request, deps)).rejects.toThrow('image provider')
  })
})
