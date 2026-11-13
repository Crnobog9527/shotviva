import { describe, expect, it } from 'vitest'

import { overlay } from './messages'

describe('overlay', () => {
  it('takes a precompiled zh message (an array) whole instead of merging it into the English one', () => {
    const en = { a: { hi: ['Hi ', ['name']], plain: 'Hello', only: 'English only' } }
    const zh = { a: { hi: ['你好，', ['name']], plain: '你好' } }
    expect(overlay(en, zh)).toEqual({ a: { hi: ['你好，', ['name']], plain: '你好', only: 'English only' } })
  })

  it('merges namespaces and leaves strings as they are', () => {
    expect(overlay({ x: { y: 'a', z: 'b' } }, { x: { y: 'c' } })).toEqual({ x: { y: 'c', z: 'b' } })
  })
})
