import { describe, expect, it } from 'vitest'

import type { ImageProviderOption } from '../image-provider-field'
import { UNPRICED } from '@/core/templates/provider-pricing'
import { styleRefCopy } from './copy'
import { referenceBudget, refUploadId } from './style-ref-state'

const providers: ImageProviderOption[] = [
  { id: 'default', label: '', model: '', isActive: true, openAI: true, capabilities: null, floor: UNPRICED },
  { id: 'custom', label: '', model: '', isActive: false, openAI: false, floor: UNPRICED,
    capabilities: { originalRatio: true, aspectRatios: [], resolutions: ['1k'], minReferences: 1, maxReferences: 2, fetchedAt: '2026-01-01T00:00:00Z' } },
]
const budget = (min: number, max: number, refs: number, provider: string | null = 'custom') =>
  referenceBudget(providers, provider, JSON.stringify({ images: { min, max } }), refs)

describe('template reference budget', () => {
  it('allows no user photos when the private references satisfy the selected model', () => {
    expect(budget(0, 0, 0).problem).toBe(styleRefCopy.under)
    expect(budget(0, 0, 1)).toEqual({
      users: { min: 0, max: 0 }, refs: 1, total: { min: 1, max: 1 }, model: { min: 1, max: 2 }, problem: null,
    })
    expect(budget(0, 0, 0, null).problem).toBeNull()
  })

  it('checks both ends of the combined range and includes the exact boundaries', () => {
    expect(budget(0, 1, 0).problem).toBe(styleRefCopy.under)
    expect(budget(0, 1, 1)).toMatchObject({ total: { min: 1, max: 2 }, problem: null })
    expect(budget(1, 2, 0).problem).toBeNull()
    expect(budget(0, 2, 1).problem).toBe(styleRefCopy.over)
  })

  it('follows the active model and handles missing capabilities', () => {
    expect(budget(0, 2, 2, null)).toMatchObject({ model: { min: 0, max: 4 }, problem: null })
    expect(budget(0, 2, 3, null).problem).toBe(styleRefCopy.over)
    expect(budget(0, 0, 1, 'missing').problem).toBe(styleRefCopy.missingCap)
  })

  it('can stage references before creating a template only under a valid template ID', () => {
    expect(refUploadId(' my-new-template ')).toBe('my-new-template')
    for (const invalid of ['', '../public', 'INVALID', 'a'.repeat(65)]) expect(refUploadId(invalid)).toBeNull()
  })
})
