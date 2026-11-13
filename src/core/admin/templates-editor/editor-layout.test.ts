import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'
import { ancestorsOf, pickerNodes, visibleNodes } from './category-picker-tree'
import { toFormValues } from './form-state'
import { parseOpen } from './open-sections'
import { draftSeries, draftTemplate } from './preview-draft'

const CATEGORIES = [
  { key: 'art', nameZh: '画风', nameEn: 'Art Styles', isSystem: false, parentId: null, sortOrder: 0 },
  { key: 'food', nameZh: '餐饮', nameEn: 'Food & Drink', isSystem: false, parentId: null, sortOrder: 1 },
  { key: 'western', nameZh: '西餐', nameEn: 'Western', isSystem: false, parentId: 'food', sortOrder: 0 },
  { key: 'western-dark', nameZh: '西餐暗调质感', nameEn: 'Western Dark & Moody', isSystem: false, parentId: 'western', sortOrder: 0 },
  { key: 'coffee', nameZh: '咖啡', nameEn: 'Coffee', isSystem: false, parentId: 'food', sortOrder: 1 },
  { key: 'freeform', nameZh: '自由', nameEn: 'Freeform', isSystem: true, parentId: null, sortOrder: 9 },
]

describe('category picker tree', () => {
  const nodes = pickerNodes(CATEGORIES)

  it('lists every non-system category with its depth, parent and whether it has children', () => {
    expect(nodes.map(node => [node.key, node.depth, node.parentKey, node.hasChildren])).toEqual([
      ['art', 0, null, false], ['food', 0, null, true], ['western', 1, 'food', true],
      ['western-dark', 2, 'western', false], ['coffee', 1, 'food', false],
    ])
    expect(nodes.find(node => node.key === 'western-dark')?.label).toBe('餐饮 / 西餐 / 西餐暗调质感')
  })

  it('shows only the roots until a branch is opened, and a level-3 row once both levels are', () => {
    expect(visibleNodes(nodes, new Set(), '').map(node => node.key)).toEqual(['art', 'food'])
    expect(visibleNodes(nodes, new Set(['food']), '').map(node => node.key)).toEqual(['art', 'food', 'western', 'coffee'])
    expect(visibleNodes(nodes, new Set(['food', 'western']), '').map(node => node.key)).toContain('western-dark')
  })

  it('searches Chinese, English and keys, keeping the branches above a hit', () => {
    expect(visibleNodes(nodes, new Set(), '暗调').map(node => node.key)).toEqual(['food', 'western', 'western-dark'])
    expect(visibleNodes(nodes, new Set(), 'MOODY').map(node => node.key)).toEqual(['food', 'western', 'western-dark'])
    expect(visibleNodes(nodes, new Set(), 'nothing')).toEqual([])
  })

  it('names the ancestors a chosen category needs open', () => {
    expect(ancestorsOf(nodes, 'western-dark')).toEqual(['food', 'western'])
    expect(ancestorsOf(nodes, 'art')).toEqual([])
  })
})

describe('remembered sections', () => {
  it('falls back to the defaults on nothing stored or a broken value, and drops unknown ids', () => {
    expect(parseOpen(null).has('basic')).toBe(true)
    expect(parseOpen('{oops').has('basic')).toBe(true)
    expect([...parseOpen('["form","nope"]')]).toEqual(['form'])
    expect(parseOpen('[]').size).toBe(0)
  })
})

const base: AdminTemplate = {
  id: 'steak', module: 'image', name: 'Steak', description: 'Old line', category: 'food', subcategoryKey: 'western-dark',
  categoryInfo: { key: 'food', nameEn: 'Food & Drink', nameZh: '餐饮', introEn: null, introZh: null, cardStyle: 'pair', sortOrder: 1, isSystem: false },
  coverBeforeUrl: null, coverAfterUrl: null, coverMediaType: 'image', coverVideoUrl: null, coverPosterUrl: null, coverLocales: {},
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'], toggles: [] },
  quality: 'medium', creditsCost: { '1k': 3, '2k': 4, '4k': 6 }, sortOrder: 1, isActive: true, visibleIn: ['web'],
  translations: {}, featuredRank: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  seriesId: 's1', seriesSortOrder: 2,
  prompt: { styleRefs: [], providerId: null, body: 'private', modelParams: {}, version: 1 },
}

describe('live preview draft', () => {
  it('lays the unsaved name, description, Chinese text, price and root category over the saved template', () => {
    const values = { ...toFormValues(base), name: 'Steak night', description: '', zh: { name: '牛排之夜', description: '暗调' }, category: 'art' }
    values.credits = { ...values.credits, '1k': '5', '2k': 'x' }
    const { template, stale } = draftTemplate(values, base, CATEGORIES)
    expect(stale).toBe(false)
    expect(template).toMatchObject({ name: 'Steak night', description: null, category: 'art', creditsCost: { '1k': 5, '2k': 4, '4k': 6 } })
    expect(template.categoryInfo).toMatchObject({ key: 'art', nameZh: '画风' })
    expect(template.translations.zh).toMatchObject({ name: '牛排之夜', description: '暗调' })
  })

  it('keeps the saved fields while the fields JSON does not parse', () => {
    const { template, stale } = draftTemplate({ ...toFormValues(base), fieldsJson: '{ broken' }, base, CATEGORIES)
    expect(stale).toBe(true)
    expect(template.fields).toBe(base.fields)
  })

  it('puts the draft in its series place among the published members', () => {
    const member = (id: string, order: number, isActive = true): AdminTemplate => ({ ...base, id, seriesSortOrder: order, isActive })
    const all = [member('a', 1), base, member('c', 3), member('hidden', 4, false)]
    const series = draftSeries({ ...base, name: 'Draft' }, 's1', all, [{ id: 's1', nameZh: '西餐·暗调质感' }])
    expect(series?.name).toBe('西餐·暗调质感')
    expect(series?.members.map(m => [m.id, m.name])).toEqual([['a', 'Steak'], ['steak', 'Draft'], ['c', 'Steak']])
    expect(draftSeries(base, null, all, [])).toBeNull()
  })
})
