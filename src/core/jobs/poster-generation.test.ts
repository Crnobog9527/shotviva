import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { posterFieldsSchema } from '../poster'
import { templateFieldsSchema } from '../templates/schema'
import { assertPageSlots } from './poster-generation'

const name = { en: 'x', zh: 'x' }
const poster = posterFieldsSchema.parse({ kinds: [
  { key: 'prizes', name, blocks: ['prizes'], slots: ['prize_photo'] },
  { key: 'rules', name, blocks: ['table'] },
] })
const photo = [{ key: 'prize_photo', label: 'Prize photo', upload: 'inputs/u/a.webp' }]

describe('a poster page takes only its own image slots', () => {
  it('lets the prize page send the prize photo and refuses it on page 2', () => {
    expect(() => assertPageSlots(poster, 'prizes', photo)).not.toThrow()
    expect(() => assertPageSlots(poster, 'prizes', undefined)).not.toThrow()
    expect(() => assertPageSlots(poster, 'rules', photo)).toThrow(/no such image/)
  })

  it('refuses a template whose page lists a slot it does not define', () => {
    const base = { images: { min: 0, max: 0 }, aspectRatios: ['1:2'], poster: { kinds: [{ key: 'prizes', name, blocks: ['prizes'], slots: ['prize_photo'] }] } }
    expect(templateFieldsSchema.safeParse(base).success).toBe(false)
    const slots = [{ key: 'prize_photo', label: 'Prize photo', required: false }]
    expect(templateFieldsSchema.safeParse({ ...base, images: { min: 0, max: 1, slots } }).success).toBe(true)
  })
})
