import { describe, expect, it } from 'vitest'

import { publicCaseEntries, toHomeCaseStrip } from './home-case-strip'

const row = (locale: string, rank: number, template_id: string | null, bundle_id: string | null = null) => ({ locale, rank, template_id, bundle_id })
const bundles = { list: [{ id: 'b1', nameEn: 'Brunch', nameZh: '早午餐', templateIds: ['x', 'y'], featuredRank: null }], locale: {} }

describe('toHomeCaseStrip', () => {
  it('groups the rows by language in rank order, templates and bundles alike', () => {
    expect(toHomeCaseStrip([row('zh', 2, null, 'b1'), row('en', 1, 'a'), row('zh', 1, 'c'), row('xx', 1, 'd')])).toEqual({
      en: [{ kind: 'template', id: 'a' }],
      zh: [{ kind: 'template', id: 'c' }, { kind: 'bundle', id: 'b1' }],
    })
  })
})

describe('publicCaseEntries', () => {
  it('gives a bundle its name in the page\'s language and its templates, and drops one that is gone', () => {
    const entries = [{ kind: 'bundle' as const, id: 'b1' }, { kind: 'bundle' as const, id: 'gone' }, { kind: 'template' as const, id: 'a' }]
    expect(publicCaseEntries(entries, bundles, 'zh')).toEqual([
      { kind: 'bundle', id: 'b1', name: '早午餐', memberIds: ['x', 'y'] },
      { kind: 'template', id: 'a' },
    ])
    expect(publicCaseEntries(entries, undefined, 'en')).toEqual([{ kind: 'template', id: 'a' }])
  })
})
