import { describe, expect, it } from 'vitest'

import { posterFieldsSchema } from '@/core/poster'

import { slotKeysAt } from './slot-places'

const name = { en: 'x', zh: 'x' }
const tournament = posterFieldsSchema.parse({ kinds: [
  { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'], slots: ['logo', 'prize_photo'] },
  { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'], slots: ['logo'] },
], qr: { slot: 'qr_code', fallback: { x: 0.05, y: 0.86, size: 0.12 } } })

// The organiser logo is one picture for the set: once, in the shared header (Owner 2026-11-15).
describe('slotKeysAt', () => {
  it('puts a slot every page lists in the shared header, not in each page tab', () => {
    expect(slotKeysAt(tournament, 'header')).toEqual(['logo'])
    expect(slotKeysAt(tournament, { kind: 'prizes' })).toEqual(['prize_photo'])
    expect(slotKeysAt(tournament, { kind: 'rules' })).toEqual([])
  })

  it('keeps the QR code in its own shared part', () => {
    expect(slotKeysAt(tournament, 'shared')).toEqual(['qr_code'])
    expect(slotKeysAt(posterFieldsSchema.parse({ kinds: tournament.kinds }), 'shared')).toEqual([])
  })

  it('leaves a one-page template its own slots', () => {
    const single = posterFieldsSchema.parse({ kinds: [tournament.kinds[0]] })
    expect(slotKeysAt(single, 'header')).toEqual([])
    expect(slotKeysAt(single, { kind: 'prizes' })).toEqual(['logo', 'prize_photo'])
  })

  it('shares nothing a page does not list', () => {
    const apart = posterFieldsSchema.parse({ kinds: [tournament.kinds[0], { ...tournament.kinds[1], slots: [] }] })
    expect(slotKeysAt(apart, 'header')).toEqual([])
    expect(slotKeysAt(apart, { kind: 'prizes' })).toEqual(['logo', 'prize_photo'])
  })
})
