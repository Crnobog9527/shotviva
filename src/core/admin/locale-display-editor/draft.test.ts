import { describe, expect, it } from 'vitest'

import type { SiblingGroup } from './display-state'
import { draftChanges, hasChanges, reorderGroup, resetFeatured, resetGroup, setBundles, setFeatured, sharedLists, toDraft } from './draft'

const group = (parent: string | null, keys: string[], own: boolean): SiblingGroup => ({ parent, title: '', keys, own })

// zh has its own top-level order and featured list; the 'a' group follows the shared order.
const saved = toDraft([group(null, ['b', 'a'], true), group('a', ['a1', 'a2'], false)], { own: true, ids: ['t2'] }, ['k2'])
const shared = sharedLists([group(null, ['a', 'b'], false), group('a', ['a1', 'a2'], false)], { own: false, ids: ['t1', 't2'] }, ['k1'])

describe('locale display draft', () => {
  it('has nothing to save until something changes', () => {
    const changes = draftChanges(saved, saved)
    expect(changes).toEqual({ groups: [], featured: null, bundles: null })
    expect(hasChanges(changes)).toBe(false)
  })

  it('collects every change of the language into one save', () => {
    let draft = reorderGroup(saved, 'a', ['a2', 'a1'])
    draft = setFeatured(draft, ['t2', 't1'], shared)
    expect(draftChanges(saved, draft)).toEqual({ groups: [{ parent: 'a', keys: ['a2', 'a1'] }], featured: ['t2', 't1'], bundles: null })
  })

  it('leaves the saved state alone: the draft is a copy', () => {
    reorderGroup(saved, null, ['a', 'b'])
    expect(saved.groups[''].ids).toEqual(['b', 'a'])
  })

  it('sends a list back on the shared order as empty', () => {
    const draft = resetFeatured(resetGroup(saved, null, shared), shared)
    expect(draft.groups['']).toEqual({ own: false, ids: ['a', 'b'] })
    expect(draft.featured).toEqual({ own: false, ids: ['t1', 't2'] })
    expect(draft.bundles).toEqual(['k1'])
    expect(draftChanges(saved, draft)).toEqual({ groups: [{ parent: null, keys: [] }], featured: [], bundles: null })
  })

  it('follows the shared featured list again when the last one is removed', () => {
    const draft = setFeatured(saved, [], shared)
    expect(draft.featured).toEqual({ own: false, ids: ['t1', 't2'] })
    expect(draftChanges(saved, draft).featured).toEqual([])
  })

  it('counts a change undone in the draft as no change', () => {
    const draft = reorderGroup(reorderGroup(saved, null, ['a', 'b']), null, ['b', 'a'])
    expect(hasChanges(draftChanges(saved, draft))).toBe(false)
  })

  it('makes a following list its own once arranged, even in the shared order', () => {
    const draft = reorderGroup(saved, 'a', ['a1', 'a2'])
    expect(draftChanges(saved, draft).groups).toEqual([{ parent: 'a', keys: ['a1', 'a2'] }])
  })

  it('saves the bundles of a language with its own list when they change', () => {
    const draft = setBundles(saved, ['k2', 'k1'])
    expect(draftChanges(saved, draft)).toEqual({ groups: [], featured: null, bundles: ['k2', 'k1'] })
  })

  it('makes a following language\'s featured list its own when its bundles are arranged', () => {
    const following = toDraft([], { own: false, ids: ['t1', 't2'] }, ['k1'])
    const draft = setBundles(following, [])
    expect(draft.featured).toEqual({ own: true, ids: ['t1', 't2'] })
    expect(draftChanges(following, draft)).toEqual({ groups: [], featured: ['t1', 't2'], bundles: [] })
  })
})
