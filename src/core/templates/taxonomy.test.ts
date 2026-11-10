import { describe, expect, it } from 'vitest'

import { buildCategoryTree, cursorSchema, pathSchema, type TaxonomyRow } from './taxonomy'

function row(key: string, parent_id: string | null, level: number, sort_order = 0): TaxonomyRow {
  return {
    key, slug: key, parent_id, level, sort_order, name_en: key, name_zh: key,
    card_style: 'pair', intro_en: null, intro_zh: null, is_system: false,
    seo_title_en: null, seo_title_zh: null, seo_description_en: null, seo_description_zh: null,
  }
}

describe('public taxonomy', () => {
  it('assembles sorted paths regardless of input order and hides descendants of omitted parents', () => {
    const tree = buildCategoryTree([row('dish', 'dark', 3), row('dark', 'food', 2), row('lost', 'hidden', 2), row('food', null, 1, 2), row('art', null, 1, 1)])
    expect(tree.map(x => x.key)).toEqual(['art', 'food'])
    expect(tree[1].children[0].children[0].path).toEqual(['food', 'dark', 'dish'])
  })

  it('rejects invalid paths and cursor filter expressions', () => {
    for (const path of [[], ['a', 'b', 'c', 'd'], ['A'], ['a/b']]) expect(pathSchema.safeParse(path).success).toBe(false)
    expect(cursorSchema.safeParse({ order: 1, key: 'x),id.neq.x' }).success).toBe(false)
  })
})
