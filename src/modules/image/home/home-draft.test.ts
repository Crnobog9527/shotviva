import { describe, expect, it } from 'vitest'

import { DRAFT_TTL_MS, parseDraft } from './home-draft'

const now = 1_800_000_000_000
const raw = (value: object) => JSON.stringify(value)
const draft = { templateId: 'white-background', aspect: '4:5', note: 'warmer', savedAt: now - 1000, hasPhoto: true }

describe('parseDraft', () => {
  it('reads back what the home generator saved before sign-up', () => {
    expect(parseDraft(raw(draft), now)).toEqual(draft)
  })

  it('drops a draft older than a day, from the future, or unreadable', () => {
    expect(parseDraft(raw({ ...draft, savedAt: now - DRAFT_TTL_MS - 1 }), now)).toBeNull()
    expect(parseDraft(raw({ ...draft, savedAt: now + 60_000 }), now)).toBeNull()
    expect(parseDraft('{not json', now)).toBeNull()
    expect(parseDraft(raw({ ...draft, templateId: 3 }), now)).toBeNull()
    expect(parseDraft(raw({ ...draft, aspect: '5:7' }), now)).toBeNull()
    expect(parseDraft(null, now)).toBeNull()
  })

  it('keeps the note within the 300 characters the field allows', () => {
    expect(parseDraft(raw({ ...draft, note: 'x'.repeat(400) }), now)?.note).toHaveLength(300)
  })
})
