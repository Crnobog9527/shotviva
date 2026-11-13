import { describe, expect, it, vi } from 'vitest'

import type { ImageRequestOptions } from '../jobs'
import { defaultTemplateProvider } from './active-provider'
import { fetchImageCapabilities } from './image-capabilities'
import { templateImageProvider } from './template-image-provider'
import type { ActiveProviderRow, ProviderAdapters } from './types'

// Ark has no Max tier. A 3k request must be refused while routing, before credits are reserved,
// whether the template names the Ark row or follows an Ark default.
const generate = vi.fn()
const adapters: ProviderAdapters = { ark_images: () => ({ id: 'ark', generate }) }
const max: ImageRequestOptions = { resolution: '3k', aspectRatio: '4:3', referenceCount: 1 }

async function arkRow(): Promise<ActiveProviderRow> {
  const capabilities = await fetchImageCapabilities('ark_images', 'https://ark.cn-beijing.volces.com/api/v3', 'doubao-seedream-5-5-261028')
  return {
    id: 'ark-row', adapter: 'ark_images', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-5-5-261028',
    resolutions: ['1k', '2k'], capabilities, prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
  }
}

describe('Ark routing', () => {
  it('refuses Max for a template bound to an Ark row', async () => {
    const row = await arkRow()
    const fallback = vi.fn()
    await expect(templateImageProvider(adapters, row.id, max, { lookup: async () => row, fallback, readKey: async () => 'k' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('refuses Max when the default provider is Ark', async () => {
    const row = await arkRow()
    await expect(defaultTemplateProvider(adapters, max, async () => row)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(generate).not.toHaveBeenCalled()
  })
})
