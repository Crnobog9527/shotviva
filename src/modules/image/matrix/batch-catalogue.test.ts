import { describe, expect, it, vi } from 'vitest'

import type { LocalizedTemplate } from '@/core/templates'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { loadBatchCatalogue } from './batch-catalogue'

vi.mock('@/core/templates', () => ({ cachedWebTemplates: vi.fn() }))

// Stand-ins: the read's rows carry just what the loader looks at once turned into cards.
type Row = { id: string; photoInput: CatalogueTemplate['photoInput'] }
const rows: Row[] = [
  { id: 'standalone', photoInput: 'required' },
  { id: 'series-member', photoInput: 'required' },
  { id: 'no-photo', photoInput: 'none' },
]
const deps = () => ({
  read: vi.fn(async () => rows as unknown as LocalizedTemplate[]),
  toCard: (row: LocalizedTemplate) => row as unknown as CatalogueTemplate,
})

describe('loadBatchCatalogue (Batch create, ?t=)', () => {
  it('reads the catalogue with series members, so a member id from a series dialog is kept', async () => {
    const d = deps()
    const { templates, initial } = await loadBatchCatalogue('zh', 'series-member', d)
    expect(d.read).toHaveBeenCalledWith('zh', true)
    expect(initial).toEqual(['series-member'])
    expect(templates.map((t) => t.id)).toEqual(['standalone', 'series-member'])
  })

  it('keeps found ids once each, drops unknown and photo-less ones, at most five', async () => {
    const { initial } = await loadBatchCatalogue('en', 'standalone,missing,standalone,no-photo,series-member', deps())
    expect(initial).toEqual(['standalone', 'series-member'])
    expect((await loadBatchCatalogue('en', undefined, deps())).initial).toEqual([])
    expect((await loadBatchCatalogue('en', ['a', 'b'], deps())).initial).toEqual([])
  })
})
