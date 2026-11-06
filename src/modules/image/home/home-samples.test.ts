import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { sampleFor, thumbFor } from './home-samples'

const template = (cover: Partial<CatalogueTemplate['cover']>): CatalogueTemplate => ({
  id: 'pure-white',
  name: 'Pure White',
  category: 'Products & Resale',
  description: null,
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  copyFields: [],
  cover: { type: 'image', before: null, after: null, motion: null, poster: null, ...cover },
})
const bundled = { 'pure-white': { before: '/home/templates/pure-white-before.webp', after: '/home/templates/pure-white-after.webp' } }

describe('home samples', () => {
  it('prefers the cover the admin set', () => {
    const live = template({ before: 'https://r2/b.webp', after: 'https://r2/a.webp' })
    expect(sampleFor(live, bundled)).toEqual({ before: 'https://r2/b.webp', after: 'https://r2/a.webp' })
    expect(thumbFor(live, bundled)).toBe('https://r2/a.webp')
  })

  it('falls back to the bundled illustrative pair, or nothing', () => {
    expect(sampleFor(template({}), bundled)).toEqual(bundled['pure-white'])
    expect(thumbFor(template({}), bundled)).toBe('/home/templates/pure-white-after.webp')
    expect(sampleFor({ ...template({}), id: 'other' }, bundled)).toBeNull()
  })
})
