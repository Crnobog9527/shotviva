import { describe, expect, it } from 'vitest'

import { isCollectionId, parseCollectionMark } from './collection-link'

describe('template collection mark (§5.1g)', () => {
  it('keeps a 12-character link id and nothing else', () => {
    expect(parseCollectionMark('a2p138a5lj0w')).toBe('a2p138a5lj0w')
    for (const value of [undefined, null, '', 'short', 'A2P138A5LJ0W', 'a2p138a5lj0w.x', 'a2p138a5lj0wx']) expect(parseCollectionMark(value)).toBeNull()
    expect(isCollectionId('a2p138a5lj0w')).toBe(true)
  })
})
