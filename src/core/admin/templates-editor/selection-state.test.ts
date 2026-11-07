import { describe, expect, it } from 'vitest'

import { headerState, selectedInOrder, toggleId, toggleVisible } from './selection-state'

describe('bulk selection', () => {
  it('ticks and unticks one row without touching the original set', () => {
    const start = new Set(['a'])
    expect([...toggleId(start, 'b', true)]).toEqual(['a', 'b'])
    expect([...toggleId(start, 'a', false)]).toEqual([])
    expect([...start]).toEqual(['a'])
  })

  it('reads the header box from the filtered rows only', () => {
    expect(headerState(['a', 'b'], new Set())).toBe(false)
    expect(headerState(['a', 'b'], new Set(['a', 'z']))).toBe('indeterminate')
    expect(headerState(['a', 'b'], new Set(['a', 'b']))).toBe(true)
  })

  it('select-all follows the search filter and keeps earlier picks', () => {
    const picked = toggleVisible(['b', 'c'], new Set(['a']), true)
    expect([...picked].sort()).toEqual(['a', 'b', 'c'])
    expect([...toggleVisible(['b', 'c'], picked, false)]).toEqual(['a'])
  })

  it('keeps list order and drops ids that no longer exist', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(selectedInOrder(rows, new Set(['c', 'gone', 'a'])).map((row) => row.id)).toEqual(['a', 'c'])
  })
})
