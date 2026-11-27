import { describe, expect, it } from 'vitest'

import { framedNote, NOTE_PREAMBLE, renderPrompt, validateGenerationInputs } from './generation-inputs'
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
      labels: { dish: 'Dish name', note: 'Note' },
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

  it('appends the user note last, verbatim, framed as the request that wins over the template', () => {
    const inputs = { copy: { dish: 'Ramen', note: '' }, aspectRatio: '1:1', note: '跟我加个餐具和食物匹配的的', toggles: {}, confirmed: [] }
    const text = renderPrompt('Studio shot of {{dish}}. Keep the bowl.', inputs)
    expect(text).toBe(`Studio shot of Ramen. Keep the bowl.\n\n${NOTE_PREAMBLE}\nUser's request: 跟我加个餐具和食物匹配的的`)
    expect(NOTE_PREAMBLE).toMatch(/earlier instruction.*the user's request wins/)
    expect(text.endsWith('跟我加个餐具和食物匹配的的')).toBe(true)
  })

  it('adds no framing at all without a note (the partner route sends none)', () => {
    const inputs = { copy: { dish: 'Ramen' }, aspectRatio: '1:1', note: '', toggles: {}, confirmed: [] }
    const text = renderPrompt('Studio shot of {{dish}}.', inputs)
    expect(text).toBe('Studio shot of Ramen.')
    expect(text).not.toContain("User's request")
    expect(framedNote('')).toBe('')
  })

  it('keeps a poster text before the framed note, and the note last', () => {
    const base = { copy: {}, aspectRatio: '4:5', toggles: {}, confirmed: [], posterText: 'Grand Opening · 6pm' }
    expect(renderPrompt('Poster.', { ...base, note: 'bolder title' })).toBe(`Poster.\n\nGrand Opening · 6pm\n\n${framedNote('bolder title')}`)
    expect(renderPrompt('Poster.', { ...base, note: '' })).toBe('Poster.\n\nGrand Opening · 6pm')
  })

  it('does not expand placeholders a note contains', () => {
    const inputs = { copy: { dish: 'Ramen' }, aspectRatio: '1:1', note: 'use {{dish}} twice', toggles: {}, confirmed: [] }
    expect(renderPrompt('Shot of {{dish}}.', inputs)).toBe(`Shot of Ramen.\n\n${NOTE_PREAMBLE}\nUser's request: use {{dish}} twice`)
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

  it('ignores a key the template no longer has when it is off, refuses it when on', () => {
    expect(validateGenerationInputs(toggled, { imageCount: 1, toggles: { removed: false } }).toggles).toEqual({ replate: false, steam: false })
    expect(() => validateGenerationInputs(toggled, { imageCount: 1, toggles: { removed: true } })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })

  it.each([
    ['unknown key', { prompt: true }],
    ['unknown key, not a boolean', { prompt: 'off' }],
    ['non-boolean value', { steam: 'yes' }],
  ])('rejects %s', (_, toggles) => {
    expect(() => validateGenerationInputs(toggled, { imageCount: 1, toggles })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })

  it('renders the off fragment by default and the on fragment when on, the note still last', () => {
    const body = 'Shot of {{dish}}. {{ replate }} {{steam}}'
    const off = validateGenerationInputs(toggled, { imageCount: 1, copy: { dish: 'Ramen' }, note: 'warmer light' })
    expect(renderPrompt(body, off, fragments)).toBe(`Shot of Ramen. FAKE-OFF STEAM-OFF\n\n${framedNote('warmer light')}`)
    const on = validateGenerationInputs(toggled, { imageCount: 1, copy: { dish: 'Ramen' }, toggles: { replate: true }, togglesConfirmed: ['replate'] })
    expect(renderPrompt(body, on, fragments)).toBe('Shot of Ramen. FAKE-ON STEAM-OFF')
  })

  it('renders a toggle without fragments as empty, never the raw placeholder', () => {
    const inputs = validateGenerationInputs(toggled, { imageCount: 1, toggles: { steam: true } })
    expect(renderPrompt('A {{steam}} B', inputs)).toBe('A  B')
  })
})

// 1848: the site-wide switch for 优化摆盘 / 优化器皿. Off, the server takes no "on" for them.
describe('forceOff (food_toggles_enabled off)', () => {
  const body = 'Shot of {{dish}}. {{replate}} {{steam}}'
  const asked = { imageCount: 1, copy: { dish: 'Ramen' }, toggles: { replate: true, steam: true }, togglesConfirmed: ['replate'] }

  it('renders forced toggles off whatever the request says, exactly like a request that left them off', () => {
    const forced = validateGenerationInputs(toggled, { ...asked, forceOff: ['replate', 'steam'] })
    const left = validateGenerationInputs(toggled, { imageCount: 1, copy: { dish: 'Ramen' } })
    expect(forced).toEqual(left)
    expect(renderPrompt(body, forced, fragments)).toBe('Shot of Ramen. FAKE-OFF STEAM-OFF')
  })

  it('never refuses: no confirmation needed, a forced key the template lacks is dropped', () => {
    const inputs = validateGenerationInputs(toggled, { imageCount: 1, toggles: { replate: true, gone: true }, forceOff: ['replate', 'gone'] })
    expect(inputs).toMatchObject({ toggles: { replate: false, steam: false }, confirmed: [] })
  })

  it('leaves the other toggles, and everything with no forced keys, as before', () => {
    expect(validateGenerationInputs(toggled, { ...asked, forceOff: ['replate'] }).toggles).toEqual({ replate: false, steam: true })
    expect(validateGenerationInputs(toggled, { ...asked, forceOff: [] })).toEqual(validateGenerationInputs(toggled, asked))
  })
})

// 1848 too: the dish name only the food flows read is left out while the switch is off.
describe('dropCopy (food_toggles_enabled off)', () => {
  const food = templateFieldsSchema.parse({
    images: { min: 1, max: 1 },
    copy: [{ key: 'dish_name', label: 'Dish name', public: true }, { key: 'price', label: 'Price' }],
    aspectRatios: ['1:1'],
  })

  it('ignores what the request sends for a dropped field and leaves it out of copy and labels', () => {
    const inputs = validateGenerationInputs(food, { imageCount: 1, copy: { dish_name: 'Mapo tofu', price: '$9' }, dropCopy: ['dish_name'] })
    expect(inputs.copy).toEqual({ price: '$9' })
    expect(inputs.labels).toEqual({ price: 'Price' })
    expect(renderPrompt('Shot of {{dish_name}}.', inputs)).toBe('Shot of .\n\nPrice: $9')
  })

  it('never refuses a dropped key, even one the template lacks', () => {
    expect(validateGenerationInputs(food, { imageCount: 1, copy: { gone: 'x' }, dropCopy: ['gone'] }).copy).toEqual({ dish_name: '', price: '' })
  })

  it('keeps every field as before when nothing is dropped', () => {
    const asked = { imageCount: 1, copy: { dish_name: 'Mapo tofu' } }
    expect(validateGenerationInputs(food, { ...asked, dropCopy: [] })).toEqual(validateGenerationInputs(food, asked))
    expect(validateGenerationInputs(food, asked).copy).toEqual({ dish_name: 'Mapo tofu', price: '' })
  })
})
