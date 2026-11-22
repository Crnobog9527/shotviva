import { describe, expect, it } from 'vitest'

import { TEMPLATE_SHARE_MAX_ITEMS } from '@/core/template-shares/rules'

import { toggled } from './share-selection'

describe('share mode picks (§5.1g)', () => {
  it('adds in tap order and removes on a second tap', () => {
    let items = toggled([], { type: 'template', id: 'b' })
    items = toggled(items, { type: 'series', id: 'x' })
    items = toggled(items, { type: 'template', id: 'a' })
    expect(items).toEqual([{ type: 'template', id: 'b' }, { type: 'series', id: 'x' }, { type: 'template', id: 'a' }])
    expect(toggled(items, { type: 'series', id: 'x' })).toEqual([{ type: 'template', id: 'b' }, { type: 'template', id: 'a' }])
  })

  it('stops at the most one link holds', () => {
    const full = Array.from({ length: TEMPLATE_SHARE_MAX_ITEMS }, (_, i) => ({ type: 'template' as const, id: `t${i}` }))
    expect(toggled(full, { type: 'template', id: 'extra' })).toBe(full)
  })
})
