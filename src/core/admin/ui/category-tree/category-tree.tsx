'use client'

import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core'
import { useId, useState, type ReactNode } from 'react'

import { treeCopy as copy } from './copy'
import { DropTarget, type DropPosition } from './drop-target'
import { TreeRow } from './tree-row'
import { treeOrder, validParents, type TreeItem, type TreeMove } from './tree'

type Props<T extends TreeItem> = {
  nodes: readonly T[]
  labelOf: (node: T) => string
  renderRow: (node: T) => ReactNode
  onMove: (move: TreeMove) => void
  disabled?: boolean
  maxLevel?: number
  rootOnly?: (node: T) => boolean
}

// Storage and domain actions belong to the caller, so reference and template taxonomies share this UI.
export function CategoryTree<T extends TreeItem>({ nodes, labelOf, renderRow, onMove, maxLevel = 3, disabled = false, rootOnly }: Props<T>) {
  const id = useId()
  const ordered = treeOrder(nodes)
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = ordered.find(node => node.key === activeId)
  const parents = new Set(active && !rootOnly?.(active) ? validParents(ordered, active, maxLevel).map(item => item.key) : [])
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }))
  const canDrop = (parent: string | null) => parent === null || parents.has(parent)
  return (
    <DndContext id={id} sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={event => setActiveId(String(event.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ over }) => {
        setActiveId(null)
        const position = over?.data.current as DropPosition | undefined
        if (active && position && canDrop(position.parentId)) onMove({ key: active.key, fromParent: active.parentId, ...position })
      }}>
      <ol className="divide-y rounded-md border px-2">
        {ordered.map(node => (
          <li key={node.key} style={{ marginInlineStart: (node.level - 1) * 20 }}>
            {active && active.key !== node.key && canDrop(node.parentId) &&
              <DropTarget label={copy.before} position={{ parentId: node.parentId, beforeKey: node.key }} />}
            <TreeRow node={node} items={ordered} label={labelOf(node)} content={renderRow(node)} onMove={onMove}
              options={{ maxLevel, labelOf, rootOnly: rootOnly?.(node) ?? false, disabled }} />
            {active && parents.has(node.key) && <DropTarget label={copy.inside} position={{ parentId: node.key, beforeKey: null }} />}
          </li>
        ))}
      </ol>
      {active && <DropTarget label={copy.append} position={{ parentId: null, beforeKey: null }} />}
      <DragOverlay dropAnimation={null}>{active && <div className="inline-flex rounded border bg-card px-3 py-2 text-sm shadow">{labelOf(active)}</div>}</DragOverlay>
    </DndContext>
  )
}
