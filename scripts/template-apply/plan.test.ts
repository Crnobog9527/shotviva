import { describe, expect, it } from 'vitest'

import { buildPlan } from './plan'
import { state, stored } from './fixtures.test-support'
import { parseBatch } from './schema'
import type { SeriesDetail } from '../../src/core/admin/template-series/types'

const ctx = { baseDir: '/nowhere', write: false, db: null as never }
const series = (slug: string, members: string[]): SeriesDetail => ({ id: `00000000-0000-4000-8000-00000000000${slug.length}`, revision: 'r', slug,
  name_en: slug, name_zh: slug, description_en: null, description_zh: null, cover_url: null, category_key: 'food-drink',
  sort_order: 0, is_active: false, show_members: false, members: members.map(id => ({ id, name: id, cover_url: null, series_id: null, is_active: false })) })

describe('buildPlan', () => {
  it('orders categories (parents first), series fields, templates, then series members', async () => {
    const batch = parseBatch({
      categories: [{ key: 'western-dark', nameEn: 'Dark', nameZh: '暗调', parent: 'western-new' }, { key: 'western-new', nameEn: 'W', nameZh: '西', parent: 'food-drink' }],
      series: [{ slug: 'set-a', nameEn: 'Set', nameZh: '套', category: 'food-drink', members: ['dish'] }],
      templates: [{ id: 'dish', series: 'set-a' }],
    })
    const plan = await buildPlan(batch, state([stored('dish')]), ctx)
    expect(plan.map(i => i.ref)).toEqual(['category:western-new', 'category:western-dark', 'series:set-a', 'template:dish', 'series-members:set-a'])
    expect(plan.every(i => i.problems.length === 0)).toBe(true)
    expect(plan[0].ops[0]).toMatchObject({ op: 'save_category', is_new: true, category: { parent_id: 'food-drink', card_style: 'pair' } })
    expect(plan[4].ops[0]).toMatchObject({ members: ['dish'], fields: { slug: 'set-a', is_active: false } })
  })

  it('moves an existing category instead of re-saving it, and leaves an unchanged one alone', async () => {
    const plan = await buildPlan(parseBatch({ categories: [{ key: 'western', nameEn: 'western', nameZh: 'western', parent: null }] }), state(), ctx)
    expect(plan[0].ops).toEqual([{ op: 'move_category', key: 'western', from_parent: 'food-drink', parent: null, before: null }])
  })

  it('pulls a listed member out of its old series through a template save, and flags conflicts', async () => {
    const old = series('old', ['dish'])
    const db = state([stored('dish', { seriesId: old.id }), stored('other')], { series: new Map([['old', old]]), seriesSlugs: new Map([[old.id, 'old']]) })
    const batch = parseBatch({ series: [{ slug: 'fresh', nameEn: 'F', nameZh: '新', category: 'food-drink', members: ['dish', 'ghost'] }],
      templates: [{ id: 'other', series: 'fresh' }] })
    const plan = await buildPlan(batch, db, ctx)
    expect(plan.find(i => i.ref === 'template:dish')?.ops[0]).toMatchObject({ series_slug: 'fresh' })
    expect(plan.find(i => i.ref === 'series-members:fresh')?.problems).toEqual(['成员模板 ghost 不存在', '模板 other 写了 series: fresh，但不在 members 里'])
  })

  it('requires a reason to unpublish a series and the names of a new one', async () => {
    const live = { ...series('live', []), is_active: true }
    const plan = await buildPlan(parseBatch({ series: [{ slug: 'live', isActive: false }, { slug: 'bare' }] }), state([], { series: new Map([['live', live]]) }), ctx)
    expect(plan[0].problems).toEqual(['系列下架要写 unpublishReason'])
    expect(plan[1].problems[0]).toContain('nameEn')
  })
})
