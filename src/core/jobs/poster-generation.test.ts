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

// The user's QR code (ARCHITECTURE §5.3 「二维码」): pasted by code onto every page, never sent to
// the model.
describe('a poster QR code slot', () => {
  const qrSlot = { key: 'qr_code', label: 'QR code', required: false, sendToModel: false }
  const prize = { key: 'prize_photo', label: 'Prize photo', required: false }
  const qr = { slot: 'qr_code', fallback: { x: 0.05, y: 0.86, size: 0.12 } }
  const kinds = [{ key: 'prizes', name, blocks: ['prizes'], slots: ['prize_photo'] }, { key: 'rules', name, blocks: ['table'] }]
  const fields = { images: { min: 0, max: 2, slots: [prize, qrSlot] }, aspectRatios: ['1:2'], poster: { kinds, qr } }

  it('goes with every page', () => {
    const withQr = posterFieldsSchema.parse({ kinds, qr })
    const code = [{ key: 'qr_code', label: 'QR code', upload: 'inputs/u/q.png' }]
    expect(() => assertPageSlots(withQr, 'rules', code)).not.toThrow()
    expect(() => assertPageSlots(withQr, 'prizes', [...photo, ...code])).not.toThrow()
    expect(() => assertPageSlots(poster, 'rules', code)).toThrow(/no such image/)
  })

  it('must be an optional slot the model never gets, and only the QR slot may skip the model', () => {
    expect(templateFieldsSchema.safeParse(fields).success).toBe(true)
    expect(templateFieldsSchema.safeParse({ ...fields, images: { min: 0, max: 2, slots: [prize, { ...qrSlot, sendToModel: true }] } }).success).toBe(false)
    expect(templateFieldsSchema.safeParse({ ...fields, images: { min: 1, max: 2, slots: [prize, { ...qrSlot, required: true }] } }).success).toBe(false)
    expect(templateFieldsSchema.safeParse({ ...fields, poster: { kinds } }).success).toBe(false)
  })
})
