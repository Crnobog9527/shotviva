import { describe, expect, it } from 'vitest'

import type { AdminCategoryNode } from '../template-categories/types'
import { rolledUpCounts } from './category-counts'

const node = (key: string, parentId: string | null, templateCount: number, seriesCount = 0) =>
  ({ key, parentId, templateCount, seriesCount }) as AdminCategoryNode

describe('分类管理 counts', () => {
  const nodes = [
    node('food', null, 0), node('cn', 'food', 86, 13), node('hotpot', 'food', 65, 8),
    node('western', 'food', 2), node('mains', 'western', 10, 2), node('finger', 'western', 4),
    node('art', null, 56, 2),
  ]
  const counts = rolledUpCounts(nodes)

  it('gives a parent everything under it, each template and series once', () => {
    expect(counts.get('food')).toEqual({ templates: 167, series: 23, directTemplates: 0, directSeries: 0 })
    expect(counts.get('western')).toEqual({ templates: 16, series: 2, directTemplates: 2, directSeries: 0 })
  })

  it('leaves a row without children as it was', () => {
    expect(counts.get('cn')).toEqual({ templates: 86, series: 13, directTemplates: 86, directSeries: 13 })
    expect(counts.get('art')).toEqual({ templates: 56, series: 2, directTemplates: 56, directSeries: 2 })
  })

  it('does not loop on a broken parent chain', () => {
    const loop = rolledUpCounts([node('a', 'b', 1), node('b', 'a', 2)])
    expect(loop.get('a')?.templates).toBeGreaterThan(0)
  })
})
