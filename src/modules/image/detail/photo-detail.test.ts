import { describe, expect, it } from 'vitest'

import type { Translate } from '@/core/translate'

import { dayLabel, noteOf, toPhotoDetail } from './photo-detail'
import { viewsFor } from './view-chips'

// Echoes the key: which message is picked is what this tests (the words: app/photo-detail-messages).
const when = Object.assign((key: string) => key, { has: () => true }) as Translate
const short = (date: Date) => date.toISOString().slice(5, 10)

describe('toPhotoDetail', () => {
  it('shows the note exactly as typed (trimmed) and nothing else from inputs', () => {
    const inputs = {
      note: '  Keep the chain gold\nsoften the shadow  ',
      copy: { dish: 'ramen' },
      prompt_version: 7,
      // Not stored today (ARCHITECTURE §4); even if a stray field appeared, it is never read.
      prompt: 'WRAPPED studio shot of {{dish}}',
    }
    const detail = toPhotoDetail({ inputs }, '/api/files/j/original')
    expect(detail).toEqual({ note: 'Keep the chain gold\nsoften the shadow', original: { kind: 'preview', url: '/api/files/j/original' } })
    expect(JSON.stringify(detail)).not.toMatch(/WRAPPED|prompt/i)
  })

  it('has no note when none was written, and a deleted original without a preview', () => {
    expect(toPhotoDetail({ inputs: { note: '   ' } }, null)).toEqual({ note: null, original: { kind: 'deleted' } })
    expect(noteOf({})).toBeNull()
    expect(noteOf({ note: 42 })).toBeNull()
  })
})

describe('dayLabel', () => {
  const now = new Date('2026-11-06T02:30:00Z')

  it('counts days in the viewer’s zone, not the server’s', () => {
    const created = new Date('2026-11-05T20:00:00Z')
    // 20:00 UTC on the 5th is the 6th in Tokyo (like now) but the 5th in UTC.
    expect(dayLabel(created, now, 'Asia/Tokyo', when, short)).toBe('today')
    expect(dayLabel(created, now, 'UTC', when, short)).toBe('yesterday')
    expect(dayLabel(new Date('2026-11-01T12:00:00Z'), now, 'UTC', when, short)).toBe('11-01')
  })
})

describe('viewsFor', () => {
  it('offers Result | Original, or three views for a cut-out', () => {
    expect(viewsFor(false)).toEqual(['result', 'original'])
    expect(viewsFor(true)).toEqual(['result', 'checker', 'original'])
  })
})
