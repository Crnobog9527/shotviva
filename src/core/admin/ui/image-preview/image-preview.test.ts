import { describe, expect, it } from 'vitest'

import { beforeAfter } from './image-preview'

describe('beforeAfter', () => {
  it('puts 原图 before AI 出图 and drops a missing side', () => {
    expect(beforeAfter('b.webp', 'a.webp').map(image => image.label)).toEqual(['原图', 'AI 出图'])
    expect(beforeAfter(null, 'a.webp')).toEqual([{ url: 'a.webp', label: 'AI 出图' }])
    expect(beforeAfter(undefined, null)).toEqual([])
  })
})
