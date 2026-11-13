import { describe, expect, it, vi } from 'vitest'

import type { GenerationProvider, ImageRequestOptions } from '../../src/core/jobs'
import { BoundProviderUnavailable, ranOnCellProvider, refuseFallback } from './bound-provider'

const request = { resolution: '1k', aspectRatio: '4:5', referenceCount: 2 } as ImageRequestOptions
const provider = (extra: Partial<GenerationProvider> = {}) => ({ id: 'p/model', generate: vi.fn(), ...extra }) as GenerationProvider

describe('refuseFallback', () => {
  it('passes the bound provider through when it resolved', async () => {
    const bound = provider({ id: 'bound/seedream' })
    await expect(refuseFallback(async () => bound)('bound', request)).resolves.toBe(bound)
  })

  it('stops instead of running a bound template on the default model', async () => {
    const resolve = refuseFallback(async () => provider({ id: 'default/gpt', fallbackReason: 'catalog_unavailable' }))
    const run = resolve('83dfda08', request)
    await expect(run).rejects.toBeInstanceOf(BoundProviderUnavailable)
    await expect(run).rejects.toMatchObject({ providerId: '83dfda08', reason: 'catalog_unavailable' })
  })

  it('keeps the default model for a template with no bound provider', async () => {
    const fallback = provider({ id: 'default/gpt', fallbackReason: 'whatever' })
    await expect(refuseFallback(async () => fallback)(null, request)).resolves.toBe(fallback)
  })
})

describe('ranOnCellProvider', () => {
  const cell = { providerId: '83dfda08' }
  it('counts a result from the bound provider', () => {
    expect(ranOnCellProvider({ provider: '83dfda08/bytedance-seed/seedream-5-0-flash' }, cell)).toBe(true)
  })
  it('does not count a result the default model made after a fallback', () => {
    expect(ranOnCellProvider({ provider: 'ab5c5208/gpt-image-2.6-sunburst' }, cell)).toBe(false)
  })
  it('counts an old run that did not record its provider', () => {
    expect(ranOnCellProvider({ provider: null }, cell)).toBe(true)
  })
})
