'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/core/ui/cn'
import { Input } from '@/core/ui/input'

import type { CategoryOption } from './category-options'
import { ancestorsOf, pickerNodes, visibleNodes, type PickerNode } from './category-picker-tree'
import { pickerCopy as COPY } from './layout-copy'

type Props = {
  id: string
  value: string
  categories: readonly CategoryOption[]
  onChange: (key: string) => void
  // Shown while nothing is chosen.
  placeholder: string
  // A choice for '' (bulk edit's 「不修改」); without it '' is only the placeholder.
  emptyChoice?: string
}

const TRIGGER = 'border-input flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-left text-sm'

// One category of up to three levels (T75), picked from a tree whose branches open and close,
// with a search box, in place of one long flat list (Owner 2026-11-13). The list opens in the
// form's flow, not a popover, so the dialog's own scrolling never clips it.
export function CategoryPicker({ id, value, categories, onChange, placeholder, emptyChoice }: Props) {
  const nodes = pickerNodes(categories)
  const chosen = nodes.find(node => node.key === value) ?? null
  const [open, setOpen] = useState(false)
  const pick = (key: string) => {
    onChange(key)
    setOpen(false)
  }
  const shown = chosen ? `${chosen.label} · ${chosen.nameEn}` : value === '' && emptyChoice ? emptyChoice : placeholder
  return (
    <div className="grid gap-1.5">
      <button id={id} type="button" className={TRIGGER} aria-expanded={open} onClick={() => setOpen(now => !now)}>
        <span className={cn('truncate', !chosen && !emptyChoice && 'text-muted-foreground')}>{shown}</span>
        <ChevronDown className={cn('size-4 flex-none opacity-60 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? <PickerPanel nodes={nodes} value={value} emptyChoice={emptyChoice} onPick={pick} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

type PanelProps = { nodes: PickerNode[]; value: string; emptyChoice?: string; onPick: (key: string) => void; onClose: () => void }

function PickerPanel({ nodes, value, emptyChoice, onPick, onClose }: PanelProps) {
  const [query, setQuery] = useState('')
  // Opens on the chosen category's branch.
  const [expanded, setExpanded] = useState(() => new Set(ancestorsOf(nodes, value)))
  const rows = visibleNodes(nodes, expanded, query)
  const toggle = (key: string) => setExpanded(now => {
    const next = new Set(now)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const all = (on: boolean) => setExpanded(new Set(on ? nodes.filter(node => node.hasChildren).map(node => node.key) : []))
  return (
    <div className="bg-popover grid gap-2 rounded-md border p-2" onKeyDown={event => event.key === 'Escape' && (event.stopPropagation(), onClose())}>
      <div className="flex items-center gap-2">
        <Input autoFocus value={query} placeholder={COPY.search} aria-label={COPY.search} className="h-8" onChange={event => setQuery(event.target.value)} />
        <button type="button" className="text-muted-foreground shrink-0 text-xs hover:underline" onClick={() => all(true)}>{COPY.expandAll}</button>
        <button type="button" className="text-muted-foreground shrink-0 text-xs hover:underline" onClick={() => all(false)}>{COPY.collapseAll}</button>
      </div>
      <ul role="tree" className="max-h-80 overflow-y-auto">
        {emptyChoice && !query ? <ChoiceRow label={emptyChoice} depth={0} chosen={value === ''} onPick={() => onPick('')} /> : null}
        {rows.map(node => (
          <TreeRow key={node.key} node={node} chosen={node.key === value} open={query.trim() !== '' || expanded.has(node.key)}
            onToggle={() => toggle(node.key)} onPick={() => onPick(node.key)} />
        ))}
        {rows.length === 0 ? <li className="text-muted-foreground px-2 py-1.5 text-sm">{COPY.noMatch}</li> : null}
      </ul>
    </div>
  )
}

type RowProps = { node: PickerNode; chosen: boolean; open: boolean; onToggle: () => void; onPick: () => void }

function TreeRow({ node, chosen, open, onToggle, onPick }: RowProps) {
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <li role="treeitem" aria-selected={chosen} aria-expanded={node.hasChildren ? open : undefined} className="flex items-center" style={{ paddingLeft: node.depth * 20 }}>
      {node.hasChildren ? (
        <button type="button" className="text-muted-foreground grid size-7 flex-none place-items-center rounded hover:bg-accent"
          aria-label={open ? COPY.collapse(node.nameZh) : COPY.expand(node.nameZh)} onClick={onToggle}>
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ) : <span className="size-7 flex-none" />}
      <PickButton chosen={chosen} onPick={onPick}>
        <span className={cn(node.depth === 0 && 'font-medium')}>{node.nameZh}</span>
        <span className="text-muted-foreground ml-2 text-xs">{node.nameEn}</span>
      </PickButton>
    </li>
  )
}

function ChoiceRow({ label, depth, chosen, onPick }: { label: string; depth: number; chosen: boolean; onPick: () => void }) {
  return (
    <li role="treeitem" aria-selected={chosen} className="flex items-center" style={{ paddingLeft: depth * 20 }}>
      <span className="size-7 flex-none" />
      <PickButton chosen={chosen} onPick={onPick}>{label}</PickButton>
    </li>
  )
}

function PickButton({ chosen, onPick, children }: { chosen: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onPick}
      className={cn('min-h-8 flex-1 truncate rounded px-2 text-left text-sm hover:bg-accent', chosen && 'bg-primary/15 text-foreground')}>
      {children}
    </button>
  )
}
