import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { findOffSaleTemplate, publishedCategories } = await import('./off-sale')

const row = { is_active: true, visible_in: ['web'], deleted_at: null, category_key: 'food-drink', subcategory_key: 'cn-dark', template_series: null }

// A fake PostgREST: the template row by id, and category paths by key.
function db(template: unknown, paths: { key: string; path: string[]; web_visible: boolean }[]) {
  return {
    from: (table: string) => table === 'templates'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: template, error: null }) }) }) }
      : { select: () => ({ in: (_: string, keys: string[]) => ({ returns: async () => ({ data: paths.filter((p) => keys.includes(p.key)), error: null }) }) }) },
  } as never
}

describe('publishedCategories', () => {
  it('is null for a template that is not published on the web', () => {
    expect(publishedCategories(null)).toBeNull()
    expect(publishedCategories({ ...row, is_active: false })).toBeNull()
    expect(publishedCategories({ ...row, deleted_at: '2026-11-01' })).toBeNull()
    expect(publishedCategories({ ...row, visible_in: ['partner'] })).toBeNull()
    expect(publishedCategories({ ...row, template_series: { is_active: false, deleted_at: null, category_key: 'food-drink' } })).toBeNull()
  })

  it('names its own category, and its series category when it has one', () => {
    expect(publishedCategories(row)).toEqual(['cn-dark'])
    expect(publishedCategories({ ...row, template_series: { is_active: true, deleted_at: null, category_key: 'food-drink' } })).toEqual(['cn-dark', 'food-drink'])
  })
})

describe('findOffSaleTemplate', () => {
  const path = { key: 'cn-dark', path: ['food-drink', 'cn-dark'], web_visible: true }

  it('gives the category path of a published template the catalogue left out', async () => {
    await expect(findOffSaleTemplate(db(row, [path]), 'cn-black-spotlight')).resolves.toEqual({ categoryPath: ['food-drink', 'cn-dark'] })
  })

  it('is null (a 404) when the template is missing or its category is hidden', async () => {
    await expect(findOffSaleTemplate(db(null, [path]), 'gone')).resolves.toBeNull()
    await expect(findOffSaleTemplate(db(row, [{ ...path, web_visible: false }]), 'x')).resolves.toBeNull()
  })
})
