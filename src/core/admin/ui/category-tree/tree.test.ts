import { describe, expect, it } from 'vitest'
import { treeOrder, validParents, type TreeItem } from './tree'

const node = (key: string, parentId: string | null, level: number, sortOrder = 10): TreeItem => ({ key, parentId, level, sortOrder })
const root = node('root', null, 1)
const branch = node('branch', 'root', 2)
const leaf = node('leaf', 'branch', 3)
const other = node('other', null, 1, 20)
const items = [leaf, branch, other, root]

describe('shared category tree', () => {
  it('orders parents before their children and preserves sibling order', () => {
    expect(treeOrder(items)).toEqual([root, branch, leaf, other])
  })
  it('excludes descendants and keeps the entire subtree within three levels', () => {
    expect(validParents(items, root, 3)).toEqual([])
    expect(validParents(items, branch, 3)).toEqual([other, root])
    expect(validParents(items, leaf, 3)).toEqual([branch, other, root])
  })
})
