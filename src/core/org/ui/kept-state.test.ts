import { describe, expect, it } from 'vitest'

import { createKept, keep, setKept } from './kept-state'

describe('keep (request ids that outlive a row)', () => {
  it('returns the same request id for the same form after the row unmounts and mounts again', () => {
    const store = createKept()
    let n = 0
    const first = keep(store, 'u1:paid:give:id', () => `id-${++n}`)
    const afterRemount = keep(store, 'u1:paid:give:id', () => `id-${++n}`)
    expect(afterRemount).toBe(first)
    expect(n).toBe(1)
  })
  it('keeps one id per member and kind', () => {
    const store = createKept()
    let n = 0
    const ids = ['u1:paid:give:id', 'u1:promo:give:id', 'u2:paid:give:id'].map((k) => keep(store, k, () => `id-${++n}`))
    expect(new Set(ids).size).toBe(3)
  })
  it('tells a remounted form about a success that landed after it unmounted', () => {
    const store = createKept()
    const key = 'u1:paid:give:id'
    keep(store, key, () => 'A')
    let seen = 0
    store.listeners.add(() => { seen += 1 })
    setKept(store, key, 'B')
    expect(keep(store, key, () => 'C')).toBe('B')
    expect(seen).toBe(1)
  })
})
