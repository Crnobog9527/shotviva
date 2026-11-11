import { expect, it } from 'vitest'
import { nodePath, suggestCategory, suggestTemplateId } from './publish-suggestion'

const ref = [
  { key: 'r1', nameZh: '餐饮', nameEn: 'Food', parentId: null },
  { key: 'r2', nameZh: '暗调风格', nameEn: 'Dark mood', parentId: 'r1' },
  { key: 'r3', nameZh: '中餐暗调摄影', nameEn: 'Chinese dark food', parentId: 'r2' },
]
const templates = [
  { key: 'food', nameZh: '餐饮', nameEn: 'Food & Drink', parentId: null },
  { key: 'dark', nameZh: '暗调风格', nameEn: 'Dark', parentId: 'food' },
  { key: 'other-dark', nameZh: '暗调风格', nameEn: 'Dark', parentId: 'portrait' },
  { key: 'portrait', nameZh: '人像', nameEn: 'Portrait', parentId: null },
  { key: 'system', nameZh: '餐饮', nameEn: 'Food', parentId: null, isSystem: true },
]

it('walks the reference path from the root and stops at the deepest matching template category', () => {
  expect(nodePath(ref, 'r3').map(n => n.key)).toEqual(['r1', 'r2', 'r3'])
  expect(suggestCategory(nodePath(ref, 'r3'), templates)).toBe('dark')
  expect(suggestCategory(nodePath(ref, 'r1'), templates)).toBe('food')
})

it('matches English names case-insensitively, skips system categories and never matches a different branch', () => {
  expect(suggestCategory([{ key: 'x', nameZh: '别名', nameEn: ' PORTRAIT ' }], templates)).toBe('portrait')
  expect(suggestCategory([{ key: 'x', nameZh: '暗调风格', nameEn: 'Dark' }], templates)).toBeNull()
  expect(suggestCategory([{ key: 'x', nameZh: '其他', nameEn: 'Food' }], templates.slice(4))).toBeNull()
  expect(nodePath(ref, 'missing')).toEqual([])
})

it('suggests a valid, bounded template id', () => {
  const run = '0f1e2d3c-4b5a-4678-9abc-def012345678'
  expect(suggestTemplateId('Chinese Dark Food!', run)).toBe('chinese-dark-food-0f1e2d')
  expect(suggestTemplateId('中餐', run)).toBe('lab-0f1e2d')
  const long = suggestTemplateId('a'.repeat(80), run)
  expect(long.length).toBeLessThanOrEqual(64)
  expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
})
