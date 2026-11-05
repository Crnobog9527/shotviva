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
      note: '',
    })
  })

  it('takes the entry point\'s size list over the template\'s, default first', () => {
    const web = ['original', '16:9', '1:1'] as const
    expect(validateGenerationInputs(fields, { copy: { dish: 'a' }, imageCount: 1, aspects: web }).aspectRatio).toBe('original')
    expect(validateGenerationInputs(fields, { copy: { dish: 'a' }, imageCount: 1, aspects: web, aspectRatio: '16:9' }).aspectRatio).toBe('16:9')
    expect(() => validateGenerationInputs(fields, { copy: { dish: 'a' }, imageCount: 1, aspects: web, aspectRatio: '4:5' })).toThrow()
  })

  it('trims the note and caps it at 300 characters', () => {
    expect(validateGenerationInputs(fields, { copy: { dish: 'a' }, imageCount: 1, note: '  more mint ' }).note).toBe('more mint')
    expect(() => validateGenerationInputs(fields, { copy: { dish: 'a' }, imageCount: 1, note: 'x'.repeat(301) })).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
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
    expect(renderPrompt(body, { copy: { dish: 'Ramen', note: '' }, aspectRatio: '1:1', note: '' })).toBe('Studio shot of Ramen.  Ratio 1:1.')
  })

  it('appends the user note after the rendered template', () => {
    const inputs = { copy: { dish: 'Ramen', note: '' }, aspectRatio: '1:1', note: 'Add a sprig of mint' }
    expect(renderPrompt('Studio shot of {{dish}}.', inputs)).toBe('Studio shot of Ramen.\n\nAdd a sprig of mint')
  })
})
