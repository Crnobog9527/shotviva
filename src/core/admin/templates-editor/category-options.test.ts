import { expect, it } from 'vitest'

import { categoryChoices } from './category-options'

it('offers every assignable level in sibling order with the whole path for ambiguous names', () => {
  const node = (key: string, nameZh: string, parentId: string | null, isSystem = false) => ({ key, nameZh, nameEn: key, parentId, isSystem })
  const options = categoryChoices([
    node('leaf', '暗调', 'cn'), node('food', '餐饮', null), node('hidden', '暗调', 'food'),
    node('system', '系统', null, true), node('cn', '中餐', 'food'), node('other', '其他', null),
  ])
  expect(options.map(s => s.label)).toEqual(['餐饮', '餐饮 / 暗调', '餐饮 / 中餐', '餐饮 / 中餐 / 暗调', '其他'])
  expect(options.find(s => s.key === 'leaf')?.path).toEqual(['food', 'cn', 'leaf'])
})
