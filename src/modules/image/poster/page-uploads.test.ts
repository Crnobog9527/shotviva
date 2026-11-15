import { describe, expect, it } from 'vitest'

import { posterFieldsSchema } from '@/core/poster'

import { pageUploads } from './use-poster-studio'

const name = { en: 'x', zh: 'x' }
const poster = posterFieldsSchema.parse({ kinds: [
  { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'], slots: ['prize_photo'] },
  { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'] },
] })

// The prize photo goes with the prize page only (Owner 2026-11-14), never with page 2.
describe('pageUploads', () => {
  it('sends a page only the slots its kind lists', () => {
    expect(pageUploads({ poster }, 'prizes', { prize_photo: 'inputs/u/a.webp' })).toEqual({ prize_photo: 'inputs/u/a.webp' })
    expect(pageUploads({ poster }, 'rules', { prize_photo: 'inputs/u/a.webp' })).toBeNull()
    expect(pageUploads({ poster }, 'prizes', {})).toBeNull()
  })
})

// The QR code goes with every page (§5.3 「二维码」).
describe('pageUploads with a QR code', () => {
  const withQr = posterFieldsSchema.parse({ kinds: [
    { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'], slots: ['prize_photo'] },
    { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'] },
  ], qr: { slot: 'qr_code', fallback: { x: 0.05, y: 0.86, size: 0.12 } } })

  it('sends the code with both pages and the prize photo with the prize page only', () => {
    const uploads = { prize_photo: 'inputs/u/a.webp', qr_code: 'inputs/u/q.png' }
    expect(pageUploads({ poster: withQr }, 'prizes', uploads)).toEqual(uploads)
    expect(pageUploads({ poster: withQr }, 'rules', uploads)).toEqual({ qr_code: 'inputs/u/q.png' })
  })
})

// The organiser logo (listed by both pages) goes with both pages when uploaded, and with none
// when left empty (Owner 2026-11-15: 不传就不放 Logo).
describe('pageUploads with an organiser logo', () => {
  const withLogo = posterFieldsSchema.parse({ kinds: [
    { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'], slots: ['logo', 'prize_photo'] },
    { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'], slots: ['logo'] },
  ], qr: { slot: 'qr_code', fallback: { x: 0.05, y: 0.86, size: 0.12 } } })

  it('sends the logo with every page', () => {
    const uploads = { logo: 'inputs/u/l.png', qr_code: 'inputs/u/q.png' }
    expect(pageUploads({ poster: withLogo }, 'prizes', uploads)).toEqual(uploads)
    expect(pageUploads({ poster: withLogo }, 'rules', uploads)).toEqual(uploads)
  })

  it('sends nothing for a set without a logo', () => {
    expect(pageUploads({ poster: withLogo }, 'prizes', {})).toBeNull()
    expect(pageUploads({ poster: withLogo }, 'rules', { prize_photo: 'inputs/u/a.webp' })).toBeNull()
  })
})

// Featured prizes' photos (§5.3 展示位): a photo no featured prize holds is never sent.
describe('pageUploads with featured prize photos', () => {
  it('leaves out the unused photo slots', () => {
    const withPhotos = posterFieldsSchema.parse({ kinds: [
      { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'], slots: ['prize_a', 'prize_b'] },
      { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'] },
    ], featured: { count: 2, photos: ['prize_a', 'prize_b'] } })
    const uploads = { prize_a: 'inputs/u/a.webp', prize_b: 'inputs/u/b.webp' }
    expect(pageUploads({ poster: withPhotos }, 'prizes', uploads, ['prize_b'])).toEqual({ prize_a: 'inputs/u/a.webp' })
  })
})
