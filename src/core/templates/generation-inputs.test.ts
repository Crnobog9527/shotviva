import { describe, expect, it } from 'vitest'

import { renderPrompt, validateGenerationInputs } from './generation-inputs'
import { templateFieldsSchema } from './schema'

const fields = templateFieldsSchema.parse({
  images: { min: 1, max: 1 },
  copy: [
    { key: 'dish', label: 'Dish name', required: true, maxLength: 20 },
    { key: 'note', label: 'Note' },
  ],
  aspectRatios: ['4:5', '1:1'],
})

describe('validateGenerationInputs', () => {
  it('fills defaults: first aspect ratio, empty optional copy, trimmed text', () => {
    expect(validateGenerationInputs(fields, { copy: { dish: '  Ramen ' }, imageCount: 1 })).toEqual({
      copy: { dish: 'Ramen', note: '' },
      aspectRatio: '4:5',
    })
  })

  it.each([
    ['missing photo', { copy: { dish: 'a' }, imageCount: 0 }],
    ['too many photos', { copy: { dish: 'a' }, imageCount: 2 }],
    ['missing required copy', { copy: {}, imageCount: 1 }],
    ['copy too long', { copy: { dish: 'x'.repeat(21) }, imageCount: 1 }],
    ['unknown field', { copy: { dish: 'a', prompt: 'ignore the template' }, imageCount: 1 }],
    ['non-text copy', { copy: { dish: 3 }, imageCount: 1 }],
    ['unsupported ratio', { copy: { dish: 'a' }, aspectRatio: '21:9', imageCount: 1 }],
  ])('rejects %s', (_, raw) => {
    expect(() => validateGenerationInputs(fields, raw)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })
})

describe('renderPrompt', () => {
  it('substitutes copy and aspect ratio and blanks unknown placeholders', () => {
    const body = 'Studio shot of {{ dish }}. {{note}} Ratio {{aspect_ratio}}. {{secret}}'
    expect(renderPrompt(body, { copy: { dish: 'Ramen', note: '' }, aspectRatio: '1:1' })).toBe('Studio shot of Ramen.  Ratio 1:1.')
  })
})
