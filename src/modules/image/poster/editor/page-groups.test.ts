import { describe, expect, it } from 'vitest'

import { posterFieldsSchema } from '@/core/poster'

import { pageGroups } from './page-groups'

const name = { en: 'x', zh: 'x' }

describe('the editor groups a poster set by page', () => {
  it('puts header and footer once, then each page with only its own blocks', () => {
    const poster = posterFieldsSchema.parse({ kinds: [
      { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'] },
      { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'] },
    ] })
    expect(pageGroups(poster)).toEqual([
      { key: 'shared', page: null, kind: null, blocks: ['header', 'footer'] },
      { key: 'prizes', page: 1, kind: 'prizes', blocks: ['prizes'] },
      { key: 'rules', page: 2, kind: 'rules', blocks: ['sections', 'table'] },
    ])
  })

  it('gives a block listed by two kinds to the first, and skips a page left with nothing', () => {
    const poster = posterFieldsSchema.parse({ kinds: [
      { key: 'a', name, blocks: ['prizes', 'table'] },
      { key: 'b', name, blocks: ['table'] },
    ] })
    expect(pageGroups(poster)).toEqual([{ key: 'a', page: 1, kind: 'a', blocks: ['prizes', 'table'] }])
  })
})
