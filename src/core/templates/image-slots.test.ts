import { describe, expect, it } from 'vitest'

import { renderPrompt, validateGenerationInputs } from './generation-inputs'
import { keptSlotIndex, slotMapping, slotSurfaceProblems, storedSlotOrder } from './image-slots'
import { templateFieldsSchema } from './schema'

const slotted = {
  images: {
    min: 1, max: 3,
    slots: [
      { key: 'logo', label: 'Venue logo', help: 'PNG works best' },
      { key: 'prize_1', label: '1st prize photo', required: true, note: 'prize_1_note' },
      { key: 'prize_2', label: '2nd prize photo' },
    ],
  },
  copy: [
    { key: 'venue', label: 'Venue name', required: true, maxLength: 16 },
    { key: 'prize_1_note', label: '1st prize details', maxLength: 60 },
  ],
  aspectRatios: ['2:3'],
}
const fields = templateFieldsSchema.parse(slotted)
const base = { copy: { venue: 'Night Flight' }, imageCount: 0 }

describe('templateFieldsSchema with image slots', () => {
  it('accepts slots whose count and required ones match images.max / min', () => {
    expect(fields.images.slots?.map((slot) => slot.key)).toEqual(['logo', 'prize_1', 'prize_2'])
    expect(fields.images.slots?.[0]?.required).toBe(false)
  })

  it.each([
    ['max not the slot count', { ...slotted, images: { ...slotted.images, max: 4 } }],
    ['min not the required count', { ...slotted, images: { ...slotted.images, min: 0 } }],
    ['duplicate slot keys', { ...slotted, images: { ...slotted.images, slots: [slotted.images.slots[0], slotted.images.slots[0], slotted.images.slots[1]] } }],
    ['a note that is no text field', { ...slotted, copy: [slotted.copy[0]] }],
    ['a slot key that is a copy key', { ...slotted, copy: [...slotted.copy, { key: 'logo', label: 'Logo text' }] }],
    ['the reserved image_slots key', { ...slotted, copy: [...slotted.copy, { key: 'image_slots', label: 'x' }] }],
    ['an unknown slot property', { ...slotted, images: { ...slotted.images, slots: [{ ...slotted.images.slots[0], extra: true }, ...slotted.images.slots.slice(1)] } }],
    ['five slots', { ...slotted, images: { min: 0, max: 5, slots: ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, label: key })) } }],
  ])('refuses %s', (_, value) => {
    expect(templateFieldsSchema.safeParse(value).success).toBe(false)
  })

  it('allows 12 text fields, not 13', () => {
    const copy = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `f${i}`, label: `F${i}` }))
    expect(templateFieldsSchema.safeParse({ images: { min: 0, max: 0 }, copy: copy(12), aspectRatios: ['1:1'] }).success).toBe(true)
    expect(templateFieldsSchema.safeParse({ images: { min: 0, max: 0 }, copy: copy(13), aspectRatios: ['1:1'] }).success).toBe(false)
  })

  it('keeps a slot template off the partner API', () => {
    expect(slotSurfaceProblems(fields, ['web', 'partner'])).toHaveLength(1)
    expect(slotSurfaceProblems(fields, ['web'])).toEqual([])
    expect(slotSurfaceProblems({ images: {} }, ['partner'])).toEqual([])
  })
})

describe('validateGenerationInputs with image slots', () => {
  it('returns the filled slots in definition order, skipping empty ones', () => {
    const inputs = validateGenerationInputs(fields, { ...base, slots: { prize_2: 'inputs/u/b.jpg', prize_1: 'inputs/u/a.jpg' } })
    expect(inputs.slots).toEqual([
      { key: 'prize_1', label: '1st prize photo', upload: 'inputs/u/a.jpg' },
      { key: 'prize_2', label: '2nd prize photo', upload: 'inputs/u/b.jpg' },
    ])
  })

  it.each([
    ['a missing required slot', { ...base, slots: { logo: 'inputs/u/l.png' } }],
    ['an unknown slot', { ...base, slots: { prize_1: 'inputs/u/a.jpg', qr: 'inputs/u/q.png' } }],
    ['the same upload twice', { ...base, slots: { prize_1: 'inputs/u/a.jpg', prize_2: 'inputs/u/a.jpg' } }],
    ['the single upload', { ...base, imageCount: 1, slots: { prize_1: 'inputs/u/a.jpg' } }],
  ])('refuses %s', (_, raw) => {
    expect(() => validateGenerationInputs(fields, raw)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })

  it('refuses slots for a template without them', () => {
    const plain = templateFieldsSchema.parse({ images: { min: 0, max: 1 }, aspectRatios: ['1:1'] })
    expect(() => validateGenerationInputs(plain, { imageCount: 0, slots: {} })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(validateGenerationInputs(plain, { imageCount: 1 }).slots).toBeUndefined()
  })
})

describe('renderPrompt image list', () => {
  const inputsWith = (slots: Record<string, string>) => validateGenerationInputs(templateFieldsSchema.parse({ ...slotted, images: { ...slotted.images, min: 0, slots: slotted.images.slots.map((slot) => ({ ...slot, required: false })) } }), { ...base, slots })

  it('fills {{image_slots}} with the sent images only, numbered from 1', () => {
    expect(renderPrompt('Map: {{image_slots}}', inputsWith({ logo: 'inputs/u/l.png', prize_2: 'inputs/u/b.jpg' }))).toBe(
      'Map: Image 1: Venue logo; Image 2: 2nd prize photo\n\nVenue name: Night Flight',
    )
  })

  it('says so when no image is attached', () => {
    expect(renderPrompt('Map: {{image_slots}}', inputsWith({}))).toBe('Map: No images are attached.\n\nVenue name: Night Flight')
  })

  it('appends the list when the body has no placeholder', () => {
    expect(renderPrompt('Poster.', inputsWith({ prize_1: 'inputs/u/a.jpg' }))).toBe('Poster.\n\nImages: Image 1: 1st prize photo\n\nVenue name: Night Flight')
  })

  it('leaves a template without slots as it was', () => {
    const plain = templateFieldsSchema.parse({ images: { min: 0, max: 1 }, aspectRatios: ['1:1'] })
    expect(renderPrompt('A {{image_slots}}B', validateGenerationInputs(plain, { imageCount: 0 }))).toBe('A B')
  })
})

describe('slot helpers', () => {
  it('maps labels', () => expect(slotMapping(['A'])).toBe('Image 1: A'))
  it('reads the slot index from a kept copy key', () => {
    expect(keptSlotIndex('outputs/u/job-in-2.png')).toBe(1)
    expect(keptSlotIndex('outputs/u/job.png')).toBeNull()
  })
  it('reads the stored send order', () => {
    expect(storedSlotOrder([{ key: 'venue_logo', upload: 'a' }, { key: 'prize_1', upload: 'b' }, { key: 'bad' }])).toEqual(['venue_logo', 'prize_1'])
    expect(storedSlotOrder({ logo: 'a' })).toEqual([])
    expect(storedSlotOrder(null)).toEqual([])
  })
})
