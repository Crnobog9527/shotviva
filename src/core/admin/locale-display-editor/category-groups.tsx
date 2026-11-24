'use client'

import { Button } from '@/core/ui/button'

import { SortableList } from '../ui/sortable'
import { LOCALE_DISPLAY_COPY as COPY } from './copy'
import type { SiblingGroup } from './display-state'
import type { DraftList } from './draft'
import { OwnBadge, SortableRow, StaticRow } from './rows'

type Props = {
  label: string
  // The saved groups, for their titles and order on the page.
  groups: SiblingGroup[]
  // Each group's list as shown: the saved one, or the draft while editing.
  listOf: (parent: string | null) => DraftList
  nameOf: (key: string) => string
  editing: boolean
  onReorder: (parent: string | null, keys: string[]) => void
  onReset: (parent: string | null) => void
}

export function CategoryGroups({ label, groups, listOf, nameOf, editing, onReorder, onReset }: Props) {
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-sm font-medium">{label} · {COPY.categoriesTitle}</h3>
        <p className="text-xs text-muted-foreground">{editing ? COPY.categoriesEditHint : COPY.categoriesHint}</p>
      </div>
      {groups.map((group) => {
        const list = listOf(group.parent)
        return (
          <div key={group.parent ?? 'root'} className="grid gap-1.5 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{group.title}</span>
              <OwnBadge own={list.own} />
              {editing && list.own ? (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onReset(group.parent)}>{COPY.reset}</Button>
              ) : null}
            </div>
            {editing ? (
              <SortableList ids={list.ids} labelOf={nameOf} onReorder={async (next) => onReorder(group.parent, next)}>
                {(shown) => <ol className="grid gap-1">{shown.map((key) => <SortableRow key={key} id={key} name={nameOf(key)} />)}</ol>}
              </SortableList>
            ) : (
              <ol className="grid gap-1">
                {list.ids.map((key, index) => <StaticRow key={key} position={index + 1} name={nameOf(key)} />)}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}
