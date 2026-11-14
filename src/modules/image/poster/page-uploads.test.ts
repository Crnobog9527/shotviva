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
