import { describe, expect, it, vi } from 'vitest'

import type { GenerationProvider } from '../jobs'
import { templateImageProvider } from './template-image-provider'
import type { ActiveProviderRow, ProviderAdapters } from './types'

const row: ActiveProviderRow = {
  id: 'router', adapter: 'openrouter_images', baseUrl: 'https://openrouter.ai/api/v1',
  model: 'google/test', resolutions: ['1k'], prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
}

const provider: GenerationProvider = { id: 'default', generate: vi.fn() }
const adapters: ProviderAdapters = { openrouter_images: () => provider }

describe('template image provider', () => {
  it('uses the default without fetching a row when the template follows the default', async () => {
    const lookup = vi.fn()
    expect(await templateImageProvider(adapters, null, '1k', lookup, async () => provider)).toBe(provider)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('uses only the selected row and key when the resolution is supported', async () => {
    const fallback = vi.fn()
    const readKey = vi.fn(async () => 'test')
    const selected = await templateImageProvider(adapters, row.id, '1k', async () => row, fallback, readKey)
    expect(selected.id).toBe('router/google/test')
    expect(readKey).toHaveBeenCalledWith(row.id)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back before reading a key for an unsupported tier', async () => {
    const readKey = vi.fn()
    expect(await templateImageProvider(adapters, row.id, '2k', async () => row, async () => provider, readKey)).toBe(provider)
    expect(readKey).not.toHaveBeenCalled()
  })

  it('rejects a decision provider submitted directly by the admin client', async () => {
    const lookup = async () => ({ ...row, adapter: 'openai_responses' as const })
    await expect(templateImageProvider(adapters, row.id, '1k', lookup)).rejects.toThrow('image provider')
  })
})
