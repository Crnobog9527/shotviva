'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import { chipRows, type Selection } from './catalogue-filter'
import type { FilterNode } from './catalogue-view'

type Props = {
  filters: FilterNode[]
  // The account has saved templates: a 「收藏」/ Saved chip leads the bar (T83).
  saved: boolean
  value: Selection
  onChange(next: Selection): void
  // The words, passed in: the home picker (a public page) has no app.create messages.
  labels: ChipLabels
  // Hidden while a search is typed (the search covers every category).
  hidden?: boolean
}

export type ChipLabels = { all: string; filter: string; filterWithin(name: string): string }

type Chip = { key: string; name: string; pressed: boolean; select: Selection; heart?: boolean }

// Filter chips (DESIGN "Chips"), up to three levels (T102). The first row is today's bar:
// Saved, All, then the root categories, the chosen one in solid bone. Choosing a category with
// children opens a second row under it, and a chosen child with children a third. A deeper row
// leads with its own All (the level above, unnarrowed) and marks its choice with a bone rim, not
// a fill, so the eye reads one solid chip as the place and the rims as narrowing within it.
// Each row is its own horizontal rail on phones (§8.3) and wraps from md up (B comp create.html).
export function CategoryChips({ filters, saved, value, onChange, labels, hidden }: Props) {
  const savedName = useTranslations('app.favorites')('saved')
  const rows = chipRows(filters, value.path)
  const root: Chip[] = [
    ...(saved ? [{ key: '~saved', name: savedName, pressed: value.saved, select: { saved: true, path: [] }, heart: true }] : []),
    { key: '~all', name: labels.all, pressed: !value.saved && value.path.length === 0, select: { saved: false, path: [] } },
    ...(rows[0] ?? []).map((node) => ({ key: node.slug, name: node.name, pressed: value.path[0] === node.slug, select: { saved: false, path: [node.slug] } })),
  ]
  if (hidden) return null
  return (
    <div className="grid gap-2">
      <ChipRow chips={root} label={labels.filter} depth={0} onChange={onChange} />
      {rows.slice(1).map((nodes, index) => {
        const parent = value.path.slice(0, index + 1)
        const chosen = value.path[index + 1]
        const chips: Chip[] = [
          { key: '~all', name: labels.all, pressed: chosen === undefined, select: { saved: false, path: parent } },
          ...nodes.map((node) => ({ key: node.slug, name: node.name, pressed: chosen === node.slug, select: { saved: false, path: [...parent, node.slug] } })),
        ]
        const parentName = rows[index]?.find((node) => node.slug === parent.at(-1))?.name ?? ''
        return <ChipRow key={parent.join('/')} chips={chips} label={labels.filterWithin(parentName)} depth={index + 1} onChange={onChange} />
      })}
    </div>
  )
}

type RowProps = { chips: Chip[]; label: string; depth: number; onChange(next: Selection): void }

function ChipRow({ chips, label, depth, onChange }: RowProps) {
  return (
    <div role="group" aria-label={label} className={cn('no-scrollbar flex gap-2 overflow-x-auto px-(--gutter) md:flex-wrap md:overflow-visible', depth > 0 && 'chip-row-in')}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={chip.pressed}
          onClick={(event) => {
            onChange(chip.select)
            event.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
          }}
          className={cn(
            "relative inline-flex min-h-9 min-w-11 flex-none items-center justify-center gap-1.5 rounded-full px-4 py-2 whitespace-nowrap text-caption leading-none font-medium transition-[background-color,color,box-shadow] before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
            chipTone(chip.pressed, depth),
          )}
        >
          {chip.heart ? <SavedMark /> : null}
          {chip.name}
        </button>
      ))}
    </div>
  )
}

function chipTone(pressed: boolean, depth: number): string {
  if (!pressed) return 'hairline bg-wash text-bone-dim hover:bg-wash-strong hover:text-foreground'
  return depth === 0 ? 'bg-foreground text-background' : 'bg-wash-strong text-foreground shadow-[inset_0_0_0_1.5px_var(--foreground)]'
}

function SavedMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="-ml-0.5 size-3.5 text-primary" fill="currentColor">
      <path d="M12 20.2s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.5-7.5 10.1-7.5 10.1z" />
    </svg>
  )
}
