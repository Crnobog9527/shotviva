import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { posterFieldsSchema } from '../poster'
import { templateFieldsSchema } from '../templates/schema'
import { assertPageSlots, displayArea } from './poster-generation'

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

// 展示位 (§5.3, Owner 2026-11-15): only the featured prizes go to the display area, each with the
// attached image it is sent as; a photo for a prize that is not featured is refused.
describe('the display area of a prize page', () => {
  const featuredPoster = posterFieldsSchema.parse({ kinds: [
    { key: 'prizes', name, blocks: ['prizes'], slots: ['logo', 'prize_a', 'prize_b'] },
    { key: 'rules', name, blocks: ['table'] },
  ], featured: { count: 2, photos: ['prize_a', 'prize_b'] } })
  const rows = [{ rank: '冠军', rankEn: '', prize: '手机', featured: 2 }, { rank: '亚军', rankEn: '', prize: '平板' }, { rank: '季军', rankEn: '', prize: '耳机', featured: 1 }]
  const part = { prizes: { headline: '', note: '', rows } }
  const sent = (...keys: string[]) => keys.map((key) => ({ key, label: key, upload: `inputs/u/${key}.webp` }))

  it('names the featured prizes in list order with their image numbers', () => {
    const text = displayArea(featuredPoster, part, sent('logo', 'prize_b'))
    expect(text).toContain('Featured 1: 冠军 | 手机 - draw exactly the product in Image 2')
    expect(text).toContain('Featured 2: 季军 | 耳机 - no photo')
    expect(text).not.toContain('平板')
  })

  it('refuses a photo whose prize is not featured, and says nothing on a page without prizes', () => {
    const one = { prizes: { headline: '', note: '', rows: [{ rank: 'a', rankEn: '', prize: 'b', featured: 1 }] } }
    expect(() => displayArea(featuredPoster, one, sent('prize_b'))).toThrow(/not featured/)
    expect(displayArea(featuredPoster, {}, sent('logo'))).toBe('')
    expect(displayArea(poster, part, undefined)).toBe('')
  })
})
