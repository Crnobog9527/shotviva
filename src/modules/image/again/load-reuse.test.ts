import { describe, expect, it, vi } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

const mocks = vi.hoisted(() => ({ inputs: null as unknown }))
vi.mock('@/core/gallery', () => ({ galleryReuseInputs: async () => mocks.inputs }))

const { loadReuse } = await import('./load-reuse')

const template = {
  id: 'salmon',
  creditsCost: { '1k': 2, '2k': 4 },
  copyFields: [
    { key: 'dish', label: 'Dish', type: 'short', required: false, maxLength: 60, public: true },
    { key: 'phone', label: 'Phone', type: 'short', required: false, maxLength: 60, public: false },
  ],
  toggles: [],
} as unknown as CatalogueTemplate

// ARCHITECTURE §9 第 3 条 (T108): the settings, never the photo or the note.
describe('loadReuse', () => {
  it('carries size, resolution and public copy only, with no photo and no note', async () => {
    mocks.inputs = { aspect_ratio: '4:5', resolution: '2k', copy: { dish: 'Salmon', phone: '555-0100' } }
    const start = await loadReuse({} as never, { jobId: 'w1', template })
    expect(start).toMatchObject({ from: 'gallery', photos: [], missing: null, values: { aspect: '4:5', resolution: '2k', note: '', copy: { dish: 'Salmon' } } })
    expect(start?.values.copy).not.toHaveProperty('phone')
  })

  it('is nothing without an id or when the gallery does not show the work', async () => {
    expect(await loadReuse({} as never, { jobId: undefined, template })).toBeNull()
    mocks.inputs = null
    expect(await loadReuse({} as never, { jobId: 'w1', template })).toBeNull()
  })
})
