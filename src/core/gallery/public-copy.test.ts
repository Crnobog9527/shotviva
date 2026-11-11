import { describe, expect, it } from 'vitest'

import { publicCopy, publicCopyText } from './public-copy'

// ARCHITECTURE §9 第 3 条: only the copy fields, never the note or an edit instruction.
describe('publicCopy', () => {
  it('keeps filled copy fields in order and drops blanks and non-strings', () => {
    const work = { parentJobId: null, inputs: { copy: { dish: ' Salmon ', price: '', size: 3, tag: '$12' }, note: 'secret' } }
    expect(publicCopy(work)).toEqual([{ key: 'dish', value: 'Salmon' }, { key: 'tag', value: '$12' }])
    expect(publicCopyText(work)).toBe('Salmon\n$12')
  })

  it('an edited work shows no text, and a work without copy has none', () => {
    expect(publicCopy({ parentJobId: 'p', inputs: { copy: { dish: 'x' }, instruction: 'make it red' } })).toEqual([])
    expect(publicCopyText({ parentJobId: null, inputs: { note: 'only a note' } })).toBeNull()
    expect(publicCopy({ parentJobId: null, inputs: { copy: ['a'] } })).toEqual([])
  })
})
