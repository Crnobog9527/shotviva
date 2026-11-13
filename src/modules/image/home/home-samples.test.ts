import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { sampleFor, thumbFor } from './home-samples'

const template = (cover: Partial<CatalogueTemplate['cover']>): CatalogueTemplate => ({
  id: 'white-background',
  name: 'White Background',
  category: 'products-resale',
  categoryName: 'Products & Resale',
  categoryOrder: 30,
  compare: false,
  description: null,
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 },
  copyFields: [],
  toggles: [],
  cover: { type: 'image', before: null, after: null, motion: null, poster: null, ...cover },
})

describe('home samples', () => {
  it('uses the cover the admin set', () => {
    const live = template({ before: 'https://r2/b.webp', after: 'https://r2/a.webp' })
    expect(sampleFor(live)).toEqual({ before: 'https://r2/b.webp', after: 'https://r2/a.webp' })
    expect(thumbFor(live)).toBe('https://r2/a.webp')
  })

  it('shows no pair until both covers are uploaded', () => {
    expect(sampleFor(template({ after: 'https://r2/a.webp' }))).toBeNull()
    expect(thumbFor(template({}))).toBeNull()
    expect(thumbFor(template({ poster: 'https://r2/p.webp' }))).toBe('https://r2/p.webp')
  })
})
