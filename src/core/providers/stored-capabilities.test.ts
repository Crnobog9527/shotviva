import { describe, expect, it, vi } from 'vitest'

import { FULL_IMAGE_OPTIONS } from '../templates/image-options'
import type { ImageCapabilities } from '../templates/image-capabilities'

const findProviderRow = vi.fn()
vi.mock('./repository', () => ({ findProviderRow }))
const { storedAspectAccepted, templateAspectFilter } = await import('./stored-capabilities')

const ark: ImageCapabilities = {
  ...FULL_IMAGE_OPTIONS, resolutions: ['1k', '2k'], providerAspectRatios: [...FULL_IMAGE_OPTIONS.aspectRatios],
  minReferences: 0, maxReferences: 10, fetchedAt: '2026-11-13T00:00:00Z',
}

function db(providerId: string | null) {
  const maybeSingle = vi.fn(async () => ({ data: { provider_id: providerId }, error: null }))
  return { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as never
}

describe('storedAspectAccepted', () => {
  it('follows the saved provider ratios, then the site list, then original', () => {
    expect(storedAspectAccepted(ark, '9:16')).toBe(true)
    expect(storedAspectAccepted(ark, '1:2')).toBe(false)
    expect(storedAspectAccepted({ ...ark, providerAspectRatios: undefined, aspectRatios: ['1:1'] }, '1:1')).toBe(true)
    expect(storedAspectAccepted({ ...ark, originalRatio: false }, 'original')).toBe(false)
  })

  it('accepts everything for a row without saved capabilities', () => {
    expect(storedAspectAccepted(null, '1:3')).toBe(true)
  })
})

describe('templateAspectFilter', () => {
  it('narrows a bound template to its row’s saved ratios', async () => {
    findProviderRow.mockResolvedValueOnce({ capabilities: ark })
    const accepts = await templateAspectFilter(db('ark-row'), 'tournament')
    expect(findProviderRow).toHaveBeenCalledWith(expect.anything(), 'ark-row')
    expect(['1:2', '1:3', '9:16'].filter(accepts)).toEqual(['9:16'])
  })

  it('leaves a template on the default provider alone', async () => {
    findProviderRow.mockClear()
    const accepts = await templateAspectFilter(db(null), 'tournament')
    expect(['1:2', '1:3', '9:16'].filter(accepts)).toEqual(['1:2', '1:3', '9:16'])
    expect(findProviderRow).not.toHaveBeenCalled()
  })
})
