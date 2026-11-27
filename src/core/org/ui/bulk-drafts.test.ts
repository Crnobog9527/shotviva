import { describe, expect, it } from 'vitest'

import { blankAllowance, blankGrant, draftFor, membersKey } from './bulk-drafts'
import { createKept, keep, setKept } from './kept-state'

const ids = () => { let n = 0; return () => `id-${++n}` }

describe('bulk sheet drafts (kept outside the sheet)', () => {
  it('a remount (sheet closed and reopened, or the other form shown and back) keeps the request id and the values', () => {
    const store = createKept()
    const newId = ids()
    const key = membersKey(['b', 'a'])
    const first = draftFor(keep(store, 'bulk:grant', () => blankGrant(key, newId)), key, () => blankGrant(key, newId))
    setKept(store, 'bulk:grant', { ...first, each: '500' })
    const again = draftFor(keep(store, 'bulk:grant', () => blankGrant(key, newId)), key, () => blankGrant(key, newId))
    expect(again.requestId).toBe(first.requestId)
    expect(again.each).toBe('500')
  })
  it('the same members in another order are the same set; other members get a blank draft with a fresh id', () => {
    const newId = ids()
    const stored = blankAllowance(membersKey(['a', 'b']), newId)
    expect(draftFor(stored, membersKey(['b', 'a']), () => blankAllowance('x', newId))).toBe(stored)
    const other = draftFor(stored, membersKey(['a', 'c']), () => blankAllowance(membersKey(['a', 'c']), newId))
    expect(other.requestId).not.toBe(stored.requestId)
  })
  it('success rotates the id by storing a blank draft', () => {
    const store = createKept()
    const newId = ids()
    const key = 'a'
    const before = keep(store, 'bulk:allowance', () => blankAllowance(key, newId))
    setKept(store, 'bulk:allowance', blankAllowance(key, newId))
    expect(keep(store, 'bulk:allowance', () => blankAllowance(key, newId)).requestId).not.toBe(before.requestId)
  })
})
