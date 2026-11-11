import { describe, expect, it } from 'vitest'

import { checkCopyValue, cleanCopy, copyFieldSchema, copyLines } from './copy-fields'
import { renderPrompt, validateGenerationInputs } from './generation-inputs'
import { templateFieldsSchema } from './schema'

const field = (raw: Record<string, unknown>) => copyFieldSchema.parse({ key: 'f', label: 'Field', ...raw })
const rejects = (run: () => unknown) => expect(run).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))

describe('copyFieldSchema', () => {
  it('reads a row written before field types as private one-line text', () => {
    expect(copyFieldSchema.parse({ key: 'dish', label: 'Dish', maxLength: 4000 })).toEqual({
      key: 'dish', label: 'Dish', type: 'short', required: false, maxLength: 4000, public: false,
    })
  })

  it.each([
    ['a choice field with one option', { type: 'select', options: ['A'] }],
    ['a choice field with repeated options', { type: 'select', options: ['A', 'A'] }],
    ['options on a text field', { type: 'short', options: ['A', 'B'] }],
    ['bounds on a text field', { type: 'long', min: 1 }],
    ['min above max', { type: 'number', min: 5, max: 1 }],
    ['an over-long option', { type: 'select', options: ['A', 'x'.repeat(61)] }],
    ['an option cleaning would change', { type: 'select', options: ['Small', 'Extra  large'] }],
    ['an option with an invisible character', { type: 'select', options: ['Small', 'La\u200brge'] }],
    ['an unknown type', { type: 'date' }],
  ])('refuses %s', (_, raw) => {
    expect(copyFieldSchema.safeParse({ key: 'f', label: 'Field', ...raw }).success).toBe(false)
  })
})

describe('cleanCopy', () => {
  it('makes short text one line and drops control and invisible characters', () => {
    expect(cleanCopy('short', '  Big\n\tSale\u0007 \u200bnow  ')).toBe('Big Sale now')
  })

  it('keeps line breaks in long text but at most one empty line', () => {
    expect(cleanCopy('long', 'Line 1  \r\n\r\n\r\n\r\nLine   2\u0000')).toBe('Line 1\n\nLine 2')
  })
})

describe('checkCopyValue', () => {
  it('returns "" for an empty optional field and refuses an empty required one', () => {
    expect(checkCopyValue(field({}), undefined)).toBe('')
    expect(checkCopyValue(field({}), ' \n ')).toBe('')
    rejects(() => checkCopyValue(field({ required: true }), '  '))
  })

  it('counts length after cleaning', () => {
    expect(checkCopyValue(field({ maxLength: 5 }), '  a    b  ')).toBe('a b')
    rejects(() => checkCopyValue(field({ maxLength: 5 }), 'abcdef'))
  })

  it('accepts only a listed option for a choice field', () => {
    const size = field({ type: 'select', options: ['Small', 'Large'] })
    expect(checkCopyValue(size, ' Large ')).toBe('Large')
    rejects(() => checkCopyValue(size, 'Huge'))
  })

  it('accepts only a number within bounds for a number field', () => {
    const count = field({ type: 'number', min: 1, max: 10, maxLength: 6 })
    expect(checkCopyValue(count, ' 2.5 ')).toBe('2.5')
    rejects(() => checkCopyValue(count, 'two'))
    rejects(() => checkCopyValue(count, '11'))
    rejects(() => checkCopyValue(count, '0'))
    rejects(() => checkCopyValue(count, '1e3'))
  })

  it('refuses a value that is not text', () => {
    rejects(() => checkCopyValue(field({}), 3))
  })
})

describe('copyLines', () => {
  it('lists fields without a placeholder as "Label: value", in order, skipping empty ones', () => {
    const copy = { title: 'Spring Menu', tagline: '', price: '$12' }
    const labels = { title: 'Title', tagline: 'Tagline', price: 'Price' }
    expect(copyLines('Poster. {{ title }}', copy, labels)).toBe('Price: $12')
  })
})

// The whole path a request takes: validate the user's input, then build the prompt.
const fields = templateFieldsSchema.parse({
  images: { min: 1, max: 1 },
  aspectRatios: ['1:1'],
  copy: [
    { key: 'headline', label: 'Headline', required: true },
    { key: 'story', label: 'Event details', type: 'long', maxLength: 500 },
    { key: 'mood', label: 'Mood', type: 'select', options: ['Calm', 'Bold'] },
    { key: 'guests', label: 'Number of guests', type: 'number', min: 1, max: 99 },
  ],
})

describe('fields to prompt', () => {
  it('puts placeholder fields in place and the rest as labelled lines before the note', () => {
    const inputs = validateGenerationInputs(fields, {
      imageCount: 1,
      note: 'warmer light',
      copy: { headline: ' Grand\nOpening ', story: 'Doors 6pm\n\nFree drinks', mood: 'Bold', guests: '40' },
    })
    expect(renderPrompt('Poster titled "{{headline}}".', inputs)).toBe(
      'Poster titled "Grand Opening".\n\nEvent details: Doors 6pm\n\nFree drinks\nMood: Bold\nNumber of guests: 40\n\nwarmer light',
    )
  })

  it('never expands a placeholder the user typed', () => {
    const inputs = validateGenerationInputs(fields, { imageCount: 1, copy: { headline: '{{aspect_ratio}}', story: '{{headline}}' } })
    expect(renderPrompt('Title {{headline}}.', inputs)).toBe('Title {{aspect_ratio}}.\n\nEvent details: {{headline}}')
  })

  it('leaves a template whose fields all have placeholders as before', () => {
    const inputs = validateGenerationInputs(fields, { imageCount: 1, copy: { headline: 'Hi', mood: 'Calm' } })
    expect(renderPrompt('{{headline}} / {{story}} / {{mood}} / {{guests}}', inputs)).toBe('Hi /  / Calm /')
  })

  it('refuses a bad choice or number before anything is charged', () => {
    rejects(() => validateGenerationInputs(fields, { imageCount: 1, copy: { headline: 'Hi', mood: 'Loud' } }))
    rejects(() => validateGenerationInputs(fields, { imageCount: 1, copy: { headline: 'Hi', guests: '100' } }))
  })
})
