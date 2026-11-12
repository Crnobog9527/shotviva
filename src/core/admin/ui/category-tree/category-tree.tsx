'use client'

import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core'
import { useId, useState, type ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { treeCopy as copy } from './copy'
import { DropTarget, type DropPosition } from './drop-target'
import { TreeRow, type RowToggle } from './tree-row'
import { treeOrder, validParents, type TreeItem, type TreeMove } from './tree'
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
  active: T | undefined
  targets: ReadonlySet<string>
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
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = ordered.find(node => node.key === activeId)
  const targets = new Set(active && !rest.rootOnly?.(active) ? validParents(ordered, active, maxLevel).map(item => item.key) : [])
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }))
  const canDrop = (parent: string | null) => parent === null || targets.has(parent)
  // Landing inside a collapsed branch opens it, so the moved row stays in view.
  const move = (input: TreeMove) => {
    if (input.parentId) expansion.reveal(input.parentId)
    onMove(input)
  }
  const branch = { ...rest, treeId, ordered, branches, expansion, active, targets, maxLevel, disabled, onMove: move }
  return (
    <DndContext id={treeId} sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={event => setActiveId(String(event.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ over }) => {
        setActiveId(null)
        const position = over?.data.current as DropPosition | undefined
        if (active && position && canDrop(position.parentId)) move({ key: active.key, fromParent: active.parentId, ...position })
      }}>
      <ExpandControls expansion={expansion} />
      <TreeBranch parent={null} {...branch} />
      {active && <DropTarget label={copy.append} position={{ parentId: null, beforeKey: null }} />}
      <DragOverlay dropAnimation={null}>{active && <div className="inline-flex rounded border bg-card px-3 py-2 text-sm shadow">{rest.labelOf(active)}</div>}</DragOverlay>
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
  return (
    <ol id={listId} className={parent === null ? 'divide-y rounded-md border px-2' : 'ms-5 divide-y border-t'}>
      {(branch.branches.get(parent) ?? []).map(node => <TreeNode key={node.key} node={node} {...branch} />)}
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

// Which drop targets this row offers while something is being dragged.
function dropsFor(node: TreeItem, active: TreeItem | undefined, targets: ReadonlySet<string>) {
  if (!active) return { before: false, inside: false }
  return {
    before: active.key !== node.key && (node.parentId === null || targets.has(node.parentId)),
    inside: targets.has(node.key),
  }
}

function TreeNode<T extends TreeItem>({ node, ...branch }: Branch<T> & { node: T }) {
  const { treeId, ordered, branches, expansion, active, targets, labelOf, renderRow, onMove, maxLevel, disabled, rootOnly } = branch
  const childCount = branches.get(node.key)?.length ?? 0
  const listId = `${treeId}-${node.key}`
  const label = labelOf(node)
  const toggle = toggleFor(node.key, label, childCount, listId, expansion)
  const drops = dropsFor(node, active, targets)
  return (
    <li>
      {drops.before && <DropTarget label={copy.before} position={{ parentId: node.parentId, beforeKey: node.key }} />}
      <TreeRow node={node} items={ordered} label={label} toggle={toggle} onMove={onMove}
        content={renderRow(node, { childCount, collapsed: toggle !== null && !toggle.open })}
        options={{ maxLevel, labelOf, rootOnly: Boolean(rootOnly?.(node)), disabled: Boolean(disabled) }} />
      {drops.inside && <DropTarget label={copy.inside} position={{ parentId: node.key, beforeKey: null }} />}
      {toggle?.open && <TreeBranch parent={node.key} listId={listId} {...branch} />}
    </li>
  )
}
