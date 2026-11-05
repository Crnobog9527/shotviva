import { describe, expect, it } from 'vitest'

import { templateFieldsSchema, templateInputSchema } from './schema'

const base = {
  id: 'pizza-top-down',
  name: 'Pizza top-down',
  category: 'pizza',
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, aspectRatios: ['1:1'] },
}

describe('template schema', () => {
  it('accepts a minimal template and fills defaults', () => {
    const parsed = templateInputSchema.parse(base)
    expect(parsed).toMatchObject({ module: 'image', creditsCost: 1, fields: { copy: [] } })
  })

  it('rejects bad ids, empty surfaces and unknown surfaces', () => {
    expect(templateInputSchema.safeParse({ ...base, id: 'Pizza Top' }).success).toBe(false)
    expect(templateInputSchema.safeParse({ ...base, visibleIn: [] }).success).toBe(false)
    expect(templateInputSchema.safeParse({ ...base, visibleIn: ['app'] }).success).toBe(false)
  })

  it('dedupes surfaces', () => {
    expect(templateInputSchema.parse({ ...base, visibleIn: ['web', 'web'] }).visibleIn).toEqual(['web'])
  })

  it('checks image bounds and unique copy keys', () => {
    expect(templateFieldsSchema.safeParse({ images: { min: 2, max: 1 }, aspectRatios: ['1:1'] }).success).toBe(false)
    const dupe = [
      { key: 'title', label: 'A' },
      { key: 'title', label: 'B' },
    ]
    expect(templateFieldsSchema.safeParse({ images: { min: 0, max: 1 }, copy: dupe, aspectRatios: ['1:1'] }).success).toBe(false)
  })
})
