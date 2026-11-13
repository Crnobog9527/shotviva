import { describe, expect, it } from 'vitest'

import { autoCovers, selectionNames } from './list-rules'

const row = (id: string, cover_url: string | null = null) =>
  ({ id, name_zh: '系列' + id, slug: id, is_active: true, show_members: false, sort_order: 10, cover_url })
const member = (series_id: string, cover: string | null, opts: { active?: boolean; web?: boolean } = {}) => ({
  series_id, is_active: opts.active ?? true, visible_in: opts.web === false ? ['partner'] : ['web'],
  cover_after_url: cover, cover_locales: null,
})

describe('autoCovers', () => {
  it('prefers the series cover, else the first member shown on the site, as the public card does', () => {
    const rows = autoCovers([row('a', 'https://x/own.webp'), row('b'), row('c'), row('d')], [
      member('a', 'https://x/a1.webp'),
      member('b', 'https://x/hidden.webp', { active: false }), member('b', 'https://x/partner.webp', { web: false }),
      member('b', 'https://x/b2.webp'), member('b', 'https://x/b3.webp'),
      member('c', null), member('c', 'https://x/c2.webp'),
    ])
    expect(rows.map(r => r.thumb)).toEqual([
      { url: 'https://x/own.webp', kind: 'custom' },
      { url: 'https://x/b2.webp', kind: 'auto' },
      null, // the first shown member has no cover: the card shows none either
      null,
    ])
  })

  it('reads a localized after cover when the template has no plain one', () => {
    const [item] = autoCovers([row('a')], [{ ...member('a', null), cover_locales: { zh: { after: 'https://x/zh.webp' } } }])
    expect(item?.thumb).toEqual({ url: 'https://x/zh.webp', kind: 'auto' })
  })

  it('carries the member 原图 for the large preview, never for a custom cover', () => {
    const rows = autoCovers([row('a'), row('b', 'https://x/own.webp')], [
      { ...member('a', 'https://x/a.webp'), cover_before_url: 'https://x/a-before.webp' },
      { ...member('b', 'https://x/b.webp'), cover_before_url: 'https://x/b-before.webp' },
    ])
    expect(rows.map(r => r.thumb)).toEqual([
      { url: 'https://x/a.webp', before: 'https://x/a-before.webp', kind: 'auto' },
      { url: 'https://x/own.webp', kind: 'custom' },
    ])
  })
})

it('lists the checked series names in list order', () => {
  expect(selectionNames([row('a'), row('b'), row('c')], new Set(['c', 'a']))).toEqual(['系列a', '系列c'])
})
