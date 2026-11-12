import { describe, expect, it } from 'vitest'
import { parentKeys, parseExpanded, revealPath, treeOrder, validParents, type TreeItem } from './tree'

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

describe('collapsible branches', () => {
  it('lists only nodes that have children as expandable', () => {
    expect(parentKeys(items)).toEqual(new Set(['root', 'branch']))
  })
  it('reveals a node and every ancestor, stopping at unknown keys', () => {
    expect(revealPath(items, 'leaf')).toEqual(['leaf', 'branch', 'root'])
    expect(revealPath(items, 'other')).toEqual(['other'])
    expect(revealPath(items, null)).toEqual([])
    expect(revealPath(items, 'gone')).toEqual([])
  })
  it('reads stored keys defensively and drops ones the tree no longer has', () => {
    const parents = parentKeys(items)
    expect(parseExpanded(null, parents)).toEqual(new Set())
    expect(parseExpanded('not json', parents)).toEqual(new Set())
    expect(parseExpanded('{"root":true}', parents)).toEqual(new Set())
    expect(parseExpanded('["root","leaf","gone",3]', parents)).toEqual(new Set(['root']))
  })
})
