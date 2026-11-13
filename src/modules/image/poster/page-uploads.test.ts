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
