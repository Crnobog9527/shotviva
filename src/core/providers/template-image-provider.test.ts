import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerationProvider, ImageRequestOptions } from '../jobs'
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
const request: ImageRequestOptions = { resolution: '1k', aspectRatio: '4:5', referenceCount: 1 }

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
    const selected = await templateImageProvider(adapters, row.id, { ...request, referenceCount: 3 }, deps)
    expect(selected.id).toBe(`${row.id}/${row.model}`)
    expect(deps.readKey).toHaveBeenCalledWith(row.id)
    expect(deps.fallback).not.toHaveBeenCalled()
  })

  it.each([
    ['2k', '4:5', 1, 'unsupported_resolution'],
    ['1k', '2:1', 1, 'unsupported_aspect_ratio'],
    ['1k', '4:5', 5, 'reference_image_limit'],
    ['1k', '4:5', 1, 'catalog_unavailable'],
    ['1k', '4:5', 1, 'model_missing'],
  ] as const)('selects the default before reading the template key (%s, %s, %i, %s)', async (resolution, aspectRatio, count, reason) => {
    const deps = dependencies()
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    if (reason === 'catalog_unavailable') {
      deps.parameters.mockRejectedValueOnce(new ProviderSettingError('openrouter_catalog_unavailable', 'Images catalogue timed out'))
    }
    if (reason === 'model_missing') deps.parameters.mockRejectedValueOnce(new ProviderSettingError('openrouter_model_missing', 'Model missing'))
    const selected = await templateImageProvider(adapters, row.id, { resolution, aspectRatio, referenceCount: count }, deps)
    expect(selected).toMatchObject({ ...defaultProvider, fallbackReason: reason })
    expect(deps.readKey).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith('image.provider.fallback', expect.objectContaining({
      reason, requestedProvider: `${row.id}/${row.model}`, actualProvider: defaultProvider.id,
    }))
  })

  it('takes four photo slots plus one cover reference on the OpenAI line, and falls back above its limit', async () => {
    const openAI: ActiveProviderRow = {
      id: 'openai', adapter: 'openai_images', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2.6', resolutions: ['1k'],
      prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
    }
    const withOpenAI: ProviderAdapters = { openai_images: () => ({ id: 'openai-image', generate: vi.fn() }) }
    const deps = { ...dependencies(), lookup: vi.fn(async () => openAI) }
    vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    const five = await templateImageProvider(withOpenAI, openAI.id, { ...request, referenceCount: 5 }, deps)
    expect(five).toMatchObject({ id: 'openai/gpt-image-2.6', maxReferences: 16 })
    expect(await templateImageProvider(withOpenAI, openAI.id, { ...request, referenceCount: 17 }, deps))
      .toMatchObject({ ...defaultProvider, fallbackReason: 'reference_image_limit' })
  })

  it('rejects a decision provider submitted directly by the admin client', async () => {
    const deps = dependencies()
    deps.lookup.mockResolvedValue({ ...row, adapter: 'openai_responses' })
    await expect(templateImageProvider(adapters, row.id, request, deps)).rejects.toThrow('image provider')
  })
})
