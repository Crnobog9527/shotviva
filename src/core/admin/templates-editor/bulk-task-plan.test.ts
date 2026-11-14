import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'
import { movedOrders, planTask } from './bulk-task-plan'

const row = (id: string, extra: Partial<AdminTemplate> = {}) =>
  ({ id, name: id.toUpperCase(), isActive: false, saleEnabled: false, seriesId: null, categoryInfo: { isSystem: false }, ...extra }) as unknown as AdminTemplate

describe('bulk task plans', () => {
  it('deletes unpublished templates only and says why the rest are skipped', () => {
    const plan = planTask('delete', [row('a'), row('b', { isActive: true }), row('freeform', { categoryInfo: { isSystem: true } as AdminTemplate['categoryInfo'] })])
    expect(plan.will.map(t => t.id)).toEqual(['a'])
    expect(plan.skipped.map(s => [s.template.id, s.reason])).toEqual([['b', '已上架，先下架才能删除'], ['freeform', '系统模板不能删除']])
  })

  it('opens sale where it is closed, and stops it only on unpublished templates', () => {
    expect(planTask('saleOn', [row('a'), row('b', { saleEnabled: true })]).will.map(t => t.id)).toEqual(['a'])
    const off = planTask('saleOff', [row('a', { saleEnabled: true }), row('b', { saleEnabled: true, isActive: true }), row('c')])
    expect(off.will.map(t => t.id)).toEqual(['a'])
    expect(off.skipped.map(s => s.template.id)).toEqual(['b', 'c'])
  })

  it('takes out of a series only the ones in one', () => {
    expect(planTask('seriesLeave', [row('a', { seriesId: 's' }), row('b')]).will.map(t => t.id)).toEqual(['a'])
  })
})

describe('move to top / bottom', () => {
  const list = [row('a', { isActive: true }), row('b', { isActive: true }), row('c', { isActive: true }), row('d'), row('e')]

  it('moves the ticked ones to the start of their own list, keeping their order', () => {
    expect(movedOrders(list, new Set(['c', 'b', 'e']), true)).toEqual([
      { group: 'active', ids: ['b', 'c', 'a'], expectedIds: ['a', 'b', 'c'] },
      { group: 'inactive', ids: ['e', 'd'], expectedIds: ['d', 'e'] },
    ])
  })

  it('moves them to the end, and skips a list already in that order', () => {
    expect(movedOrders(list, new Set(['a', 'e']), false)).toEqual([{ group: 'active', ids: ['b', 'c', 'a'], expectedIds: ['a', 'b', 'c'] }])
  })
})
