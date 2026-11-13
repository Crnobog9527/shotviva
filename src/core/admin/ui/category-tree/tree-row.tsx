'use client'

import { ChevronRight } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { MoveButtons, sortableCopy } from '../sortable'
import { TreeHandleRow, type RowDrag } from './tree-handle'
import { treeCopy as copy } from './copy'
import { positionBefore, validParents, type TreeItem, type TreeMove } from './tree'

// The disclosure button for a row with children; null for a leaf.
export type RowToggle = { open: boolean; controls: string | undefined; label: string; onToggle: () => void }

type Props<T extends TreeItem> = {
  node: T; items: readonly T[]; label: string; content: ReactNode; toggle: RowToggle | null; drag: RowDrag
  options: { maxLevel: number; labelOf: (item: T) => string; rootOnly: boolean; disabled: boolean }
  onMove: (move: TreeMove) => void
}

export function TreeRow<T extends TreeItem>({ node, items, label, content, toggle, drag, options, onMove }: Props<T>) {
  const [choosing, setChoosing] = useState(false)
  const siblings = items.filter(item => item.parentId === node.parentId)
  const index = siblings.findIndex(item => item.key === node.key)
  function move(parentId: string | null, beforeKey: string | null) {
    setChoosing(false)
    onMove({ key: node.key, fromParent: node.parentId, parentId, beforeKey })
  }
  return (
    <TreeHandleRow node={node} siblings={siblings} label={label} drag={drag} disabled={options.disabled} onReorder={before => move(node.parentId, before)}
      leading={toggle
        ? <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-expanded={toggle.open} aria-controls={toggle.controls}
            aria-label={toggle.label} title={toggle.label} onClick={toggle.onToggle}>
            <ChevronRight aria-hidden className={cn('transition-transform motion-reduce:transition-none', toggle.open && 'rotate-90')} />
          </Button>
        : <span aria-hidden className="size-6 shrink-0" />}>
      <MoveButtons item={{
        moveUp: { label: sortableCopy.moveUp(label), disabled: options.disabled || index === 0, onClick: () => move(node.parentId, siblings[index - 1].key) },
        moveDown: { label: sortableCopy.moveDown(label), disabled: options.disabled || index === siblings.length - 1, onClick: () => move(node.parentId, siblings[index + 2]?.key ?? null) },
      }} />
      <PositionInput key={`${index}/${siblings.length}`} index={index} total={siblings.length} label={label} disabled={options.disabled}
        onCommit={position => {
          const beforeKey = positionBefore(siblings.map(item => item.key), node.key, position)
          if (beforeKey !== undefined) move(node.parentId, beforeKey)
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

// The row's 1-based place among its siblings. Typing a number and pressing Enter (or leaving the box)
// moves the row there; Esc puts the number back. Remounted by key whenever the place changes.
function PositionInput({ index, total, label, disabled, onCommit }:
  { index: number; total: number; label: string; disabled: boolean; onCommit: (position: number) => void }) {
  const [draft, setDraft] = useState(String(index + 1))
  const commit = () => {
    const value = Number.parseInt(draft, 10)
    if (Number.isFinite(value) && value !== index + 1) onCommit(value)
    else setDraft(String(index + 1))
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); commit() }
    if (event.key === 'Escape') setDraft(String(index + 1))
  }
  return <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft} disabled={disabled || total < 2}
    aria-label={copy.position(label, total)} title={copy.positionHint}
    onChange={event => setDraft(event.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={commit} onKeyDown={onKeyDown}
    className="h-7 w-10 shrink-0 rounded-md border bg-transparent text-center text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50" />
}
