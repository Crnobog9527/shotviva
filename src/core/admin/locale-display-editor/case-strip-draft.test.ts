import { describe, expect, it } from 'vitest'

import { addEntries, entryOf, keyOf, removeEntry, reorderEntries, sameEntries, slotsLeft } from './case-strip-draft'

const t = (id: string) => ({ kind: 'template' as const, id })
const b = (id: string) => ({ kind: 'bundle' as const, id })

describe('「更多真实案例」 draft', () => {
  it('keys templates and bundles apart, and reads them back', () => {
    expect(keyOf(t('x'))).toBe('t:x')
    expect(keyOf(b('x'))).toBe('b:x')
    expect(entryOf('b:x')).toEqual(b('x'))
    expect(reorderEntries(['b:2', 't:1'])).toEqual([b('2'), t('1')])
  })

  it('appends only what is new, a template and a bundle of the same id being different entries', () => {
    expect(addEntries([t('a')], [t('a'), b('a'), t('c'), t('c')])).toEqual([t('a'), b('a'), t('c')])
  })

  it('never holds more than eight', () => {
    const seven = Array.from({ length: 7 }, (_, index) => t(`s${index}`))
    const added = addEntries(seven, [t('x'), t('y')])
    expect(added).toHaveLength(8)
    expect(added.at(-1)).toEqual(t('x'))
    expect(slotsLeft(added)).toBe(0)
    expect(slotsLeft(seven)).toBe(1)
  })

  it('removes by key and compares in order', () => {
    expect(removeEntry([t('a'), b('a')], 'b:a')).toEqual([t('a')])
    expect(sameEntries([t('a'), b('b')], [t('a'), b('b')])).toBe(true)
    expect(sameEntries([t('a'), b('b')], [b('b'), t('a')])).toBe(false)
  })
})
