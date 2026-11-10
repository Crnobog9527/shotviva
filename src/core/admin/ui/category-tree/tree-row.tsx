'use client'

import { useState, type ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { MoveButtons, sortableCopy } from '../sortable'
import { TreeHandleRow } from './tree-handle'
import { treeCopy as copy } from './copy'
import { validParents, type TreeItem, type TreeMove } from './tree'

type Props<T extends TreeItem> = {
  node: T; items: readonly T[]; label: string; content: ReactNode
  options: { maxLevel: number; labelOf: (item: T) => string; rootOnly: boolean; disabled: boolean }
  onMove: (move: TreeMove) => void
}

export function TreeRow<T extends TreeItem>({ node, items, label, content, options, onMove }: Props<T>) {
  const [choosing, setChoosing] = useState(false)
  const siblings = items.filter(item => item.parentId === node.parentId)
  const index = siblings.findIndex(item => item.key === node.key)
  function move(parentId: string | null, beforeKey: string | null) {
    setChoosing(false)
    onMove({ key: node.key, fromParent: node.parentId, parentId, beforeKey })
  }
  return (
    <TreeHandleRow node={node} siblings={siblings} label={label} disabled={options.disabled} onReorder={before => move(node.parentId, before)}>
      <MoveButtons item={{
        moveUp: { label: sortableCopy.moveUp(label), disabled: options.disabled || index === 0, onClick: () => move(node.parentId, siblings[index - 1].key) },
        moveDown: { label: sortableCopy.moveDown(label), disabled: options.disabled || index === siblings.length - 1, onClick: () => move(node.parentId, siblings[index + 2]?.key ?? null) },
      }} />
      {content}
      {!options.rootOnly &&
        <Button variant="outline" size="sm" disabled={options.disabled} onClick={() => setChoosing(!choosing)}>
          {choosing ? copy.cancel : copy.move}
        </Button>}
      {choosing && <label className="flex w-full items-center gap-2 text-sm">
        {copy.moveTo}
        <select value={node.parentId ?? ''} className="rounded border p-1" disabled={options.disabled}
          onChange={event => move(event.target.value || null, null)}>
          <option value="">{copy.root}</option>
          {validParents(items, node, options.maxLevel).map(item =>
            <option key={item.key} value={item.key}>{'　'.repeat(item.level-1)}{options.labelOf(item)}</option>)}
        </select>
      </label>}
    </TreeHandleRow>
  )
}
