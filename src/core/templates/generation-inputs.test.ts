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
      toggles: {},
      confirmed: [],
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
    expect(renderPrompt(body, { copy: { dish: 'Ramen', note: '' }, aspectRatio: '1:1', note: '', toggles: {}, confirmed: [] })).toBe('Studio shot of Ramen.  Ratio 1:1.')
  })

  it('appends the user note after the rendered template', () => {
    const inputs = { copy: { dish: 'Ramen', note: '' }, aspectRatio: '1:1', note: 'Add a sprig of mint', toggles: {}, confirmed: [] }
    expect(renderPrompt('Studio shot of {{dish}}.', inputs)).toBe('Studio shot of Ramen.\n\nAdd a sprig of mint')
  })
})

// T89: fake fragments only; real prompt text never enters the repo.
const confirm = { title: 'Sure?', body: 'It may differ.', checkbox: 'I understand', accept: 'Turn on' }
const toggled = templateFieldsSchema.parse({
  images: { min: 1, max: 1 },
  copy: [{ key: 'dish', label: 'Dish name' }],
  aspectRatios: ['1:1'],
  toggles: [
    { key: 'replate', label: 'Upgrade plating', confirm },
    { key: 'steam', label: 'Add steam' },
  ],
})
const fragments = { replate: { on: 'FAKE-ON', off: 'FAKE-OFF' }, steam: { on: 'STEAM-ON', off: 'STEAM-OFF' } }

describe('toggles (T89)', () => {
  it('defaults every toggle to off', () => {
    const inputs = validateGenerationInputs(toggled, { imageCount: 1 })
    expect(inputs.toggles).toEqual({ replate: false, steam: false })
    expect(inputs.confirmed).toEqual([])
  })

  it('refuses a confirm-required toggle turned on without the confirm flag', () => {
    expect(() => validateGenerationInputs(toggled, { imageCount: 1, toggles: { replate: true } })).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    )
  })

  it('takes it with the flag and lists it as confirmed; a toggle without a dialog needs none', () => {
    const inputs = validateGenerationInputs(toggled, { imageCount: 1, toggles: { replate: true, steam: true }, togglesConfirmed: ['replate'] })
    expect(inputs.toggles).toEqual({ replate: true, steam: true })
    expect(inputs.confirmed).toEqual(['replate'])
  })

  it('does not count a confirm flag for a toggle left off', () => {
    expect(validateGenerationInputs(toggled, { imageCount: 1, togglesConfirmed: ['replate'] }).confirmed).toEqual([])
  })

  it.each([
    ['unknown key', { prompt: true }],
    ['non-boolean value', { steam: 'yes' }],
  ])('rejects %s', (_, toggles) => {
    expect(() => validateGenerationInputs(toggled, { imageCount: 1, toggles })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })

  it('renders the off fragment by default and the on fragment when on, the note still last', () => {
    const body = 'Shot of {{dish}}. {{ replate }} {{steam}}'
    const off = validateGenerationInputs(toggled, { imageCount: 1, copy: { dish: 'Ramen' }, note: 'warmer light' })
    expect(renderPrompt(body, off, fragments)).toBe('Shot of Ramen. FAKE-OFF STEAM-OFF\n\nwarmer light')
    const on = validateGenerationInputs(toggled, { imageCount: 1, copy: { dish: 'Ramen' }, toggles: { replate: true }, togglesConfirmed: ['replate'] })
    expect(renderPrompt(body, on, fragments)).toBe('Shot of Ramen. FAKE-ON STEAM-OFF')
  })

  it('renders a toggle without fragments as empty, never the raw placeholder', () => {
    const inputs = validateGenerationInputs(toggled, { imageCount: 1, toggles: { steam: true } })
    expect(renderPrompt('A {{steam}} B', inputs)).toBe('A  B')
  })
})
