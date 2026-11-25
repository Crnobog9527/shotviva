'use client'

import { X } from 'lucide-react'

import type { HeroSceneEntry } from '@/core/templates/home-hero'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { Input } from '@/core/ui/input'

import type { AdminCategoryNode } from '../template-categories/types'
import { zhNameOf } from '../templates-editor/featured-card'
import type { AdminTemplate } from '../templates/types'
import { DragHandle, MoveButtons, sortableRowClass, SortableList, useSortableItem } from '../ui/sortable'
import { featurable } from './display-state'
import { FeaturedPicker } from './featured-picker'
import { HERO_COPY as COPY } from './hero-copy'
import { addScenes, removeScene, reorderScenes, scenesLeft, setCaption } from './hero-draft'
import { StaticRow } from './rows'

type Props = {
  label: string
  list: HeroSceneEntry[]
  templates: AdminTemplate[]
  categories: AdminCategoryNode[]
  editing: boolean
  onChange: (list: HeroSceneEntry[]) => void
}

const describe = (entry: HeroSceneEntry, templates: AdminTemplate[]) => {
  const template = templates.find((one) => one.id === entry.templateId)
  const name = zhNameOf(template, entry.templateId)
  const state = featurable(template) ? template.categoryInfo.nameZh : COPY.notLive
  return { name, detail: entry.caption ? `「${entry.caption}」 · ${state}` : state }
}

// One scope's scenes in order. Read: numbered rows. Editing: drag or arrows, a caption per row,
// remove, and add templates from the cover grid.
export function HeroList({ label, list, templates, categories, editing, onChange }: Props) {
  if (!editing) {
    return (
      <ol className="grid grid-cols-1 gap-1">
        {list.map((entry, index) => <StaticRow key={entry.templateId} position={index + 1} {...describe(entry, templates)} />)}
      </ol>
    )
  }
  const ids = list.map((entry) => entry.templateId)
  const nameOf = (id: string) => zhNameOf(templates.find((one) => one.id === id), id)
  const left = scenesLeft(list)
  return (
    <div className="grid grid-cols-1 gap-2">
      <SortableList ids={ids} labelOf={nameOf} onReorder={async (next) => onChange(reorderScenes(list, next))}>
        {(order) => (
          <ol className="grid grid-cols-1 gap-1">
            {order.flatMap((id) => list.find((entry) => entry.templateId === id) ?? []).map((entry) => (
              <SceneRow key={entry.templateId} entry={entry} name={nameOf(entry.templateId)}
                onCaption={(caption) => onChange(setCaption(list, entry.templateId, caption))}
                onRemove={() => onChange(removeScene(list, entry.templateId))} />
            ))}
          </ol>
        )}
      </SortableList>
      {left === 0 ? <p className="text-xs text-muted-foreground">{COPY.full}</p> : null}
      <FeaturedPicker locale="zh" label={label} templates={templates} categories={categories} taken={ids} max={left} text={COPY.picker}
        onAdd={(added) => onChange(addScenes(list, added))} />
    </div>
  )
}

type RowProps = { entry: HeroSceneEntry; name: string; onCaption: (caption: string) => void; onRemove: () => void }

function SceneRow({ entry, name, onCaption, onRemove }: RowProps) {
  const item = useSortableItem(entry.templateId)
  return (
    <li {...item.row} className={cn('flex flex-wrap items-center gap-1 rounded-md border bg-card px-1 py-1', sortableRowClass)}>
      <DragHandle handle={item.handle} />
      <span className="min-w-0 basis-32 flex-1 truncate text-sm">{name}</span>
      <Input value={entry.caption ?? ''} maxLength={COPY.captionMax} placeholder={COPY.captionHint(name)} aria-label={COPY.captionLabel(name)}
        className="h-8 min-w-0 basis-48 flex-[2]" onChange={(event) => onCaption(event.target.value)} />
      <MoveButtons item={item} axis="column" />
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={COPY.remove(name)} onClick={onRemove}><X aria-hidden /></Button>
    </li>
  )
}
