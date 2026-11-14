'use client'

import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type CollisionDetection } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useId, type ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { treeCopy as copy } from './copy'
import { TreeRow, type RowToggle } from './tree-row'
import { dropBefore, treeOrder, type TreeItem, type TreeMove } from './tree'
import { useExpansion, type Expansion } from './use-expansion'

// What a row's content may show beside the name: the direct children, and whether they are hidden.
export type RowMeta = { childCount: number; collapsed: boolean }

type Props<T extends TreeItem> = {
  nodes: readonly T[]
  labelOf: (node: T) => string
  renderRow: (node: T, meta: RowMeta) => ReactNode
  onMove: (move: TreeMove) => void
  // Names the remembered open/closed state; each tree on a page needs its own.
  storageKey: string
  disabled?: boolean
  maxLevel?: number
  rootOnly?: (node: T) => boolean
}

type Branch<T extends TreeItem> = Omit<Props<T>, 'nodes' | 'storageKey' | 'maxLevel'> & {
  treeId: string
  ordered: readonly T[]
  branches: ReadonlyMap<string | null, readonly T[]>
  expansion: Expansion
  maxLevel: number
}

// Storage and domain actions belong to the caller, so reference and template taxonomies share this UI.
// Branches start collapsed and remember what the admin opened. Nested lists with disclosure buttons
// (aria-expanded) rather than role="tree": every row carries its own buttons, which a treeitem cannot.
export function CategoryTree<T extends TreeItem>({ nodes, storageKey, maxLevel = 3, disabled = false, onMove, ...rest }: Props<T>) {
  const treeId = useId()
  const ordered = treeOrder(nodes)
  const branches = new Map<string | null, T[]>()
  for (const node of ordered) branches.set(node.parentId, [...(branches.get(node.parentId) ?? []), node])
  const expansion = useExpansion(storageKey, ordered)
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }))
  // Dragging reorders within one sibling list; moving to another parent stays with 「移动」.
  const collisions: CollisionDetection = args => {
    const parent = args.active.data.current?.parentId
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container =>
      container.data.current?.parentId === parent) })
  }
  // Landing inside a collapsed branch opens it, so the moved row stays in view.
  const move = (input: TreeMove) => {
    if (input.parentId) expansion.reveal(input.parentId)
    onMove(input)
  }
  const branch = { ...rest, treeId, ordered, branches, expansion, maxLevel, disabled, onMove: move }
  return (
    <DndContext id={treeId} sensors={sensors} collisionDetection={collisions}
      onDragEnd={({ active, over }) => {
        const node = ordered.find(item => item.key === active.id)
        if (!node || !over) return
        const siblings = (branches.get(node.parentId) ?? []).map(item => item.key)
        const after = siblings.indexOf(String(over.id)) > siblings.indexOf(node.key)
        const beforeKey = dropBefore(siblings, node.key, String(over.id), after)
        if (beforeKey !== undefined) move({ key: node.key, fromParent: node.parentId, parentId: node.parentId, beforeKey })
      }}>
      <ExpandControls expansion={expansion} />
      <TreeBranch parent={null} {...branch} />
    </DndContext>
  )
}

function ExpandControls({ expansion: { expanded, parents, setAll } }: { expansion: Expansion }) {
  if (parents.size === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" size="xs" disabled={expanded.size === parents.size} onClick={() => setAll(true)}>{copy.expandAll}</Button>
      <Button variant="ghost" size="xs" disabled={expanded.size === 0} onClick={() => setAll(false)}>{copy.collapseAll}</Button>
    </div>
  )
}

function TreeBranch<T extends TreeItem>({ parent, listId, ...branch }: Branch<T> & { parent: string | null; listId?: string }) {
  const siblings = branch.branches.get(parent) ?? []
  return (
    <ol id={listId} className={parent === null ? 'divide-y rounded-md border px-2' : 'ms-5 divide-y border-t'}>
      {/* Siblings slide aside while one is dragged, so the gap shows where it lands. */}
      <SortableContext items={siblings.map(node => node.key)} strategy={verticalListSortingStrategy}>
        {siblings.map(node => <TreeNode key={node.key} node={node} {...branch} />)}
      </SortableContext>
    </ol>
  )
}

// The disclosure state of one row: null for a leaf.
function toggleFor(key: string, label: string, childCount: number, listId: string, expansion: Expansion): RowToggle | null {
  if (childCount === 0) return null
  const open = expansion.expanded.has(key)
  return {
    open, controls: open ? listId : undefined, onToggle: () => expansion.toggle(key),
    label: open ? copy.collapse(label) : copy.expand(label, childCount),
  }
}

function TreeNode<T extends TreeItem>({ node, ...branch }: Branch<T> & { node: T }) {
  const { treeId, ordered, branches, expansion, labelOf, renderRow, onMove, maxLevel, disabled, rootOnly } = branch
  const childCount = branches.get(node.key)?.length ?? 0
  const listId = `${treeId}-${node.key}`
  const label = labelOf(node)
  const toggle = toggleFor(node.key, label, childCount, listId, expansion)
  // The whole item moves, sub-categories included; only the row's grip (or a long press) starts it.
  const { setNodeRef, setActivatorNodeRef, listeners, isDragging, transform, transition } =
    useSortable({ id: node.key, disabled, data: { parentId: node.parentId } })
  const y = transform ? Math.round(transform.y) : 0
  return (
    <li ref={setNodeRef} style={{ transform: y ? `translate3d(0, ${y}px, 0)` : undefined, transition }}
      className={cn('motion-reduce:transition-none', isDragging && 'relative z-20 rounded-md bg-card shadow-lg ring-1 ring-primary/50')}>
      <TreeRow node={node} items={ordered} label={label} toggle={toggle} onMove={onMove}
        drag={{ setActivatorNodeRef, listeners, isDragging }}
        content={renderRow(node, { childCount, collapsed: toggle !== null && !toggle.open })}
        options={{ maxLevel, labelOf, rootOnly: Boolean(rootOnly?.(node)), disabled: Boolean(disabled) }} />
      {toggle?.open && <TreeBranch parent={node.key} listId={listId} {...branch} />}
    </li>
  )
}
