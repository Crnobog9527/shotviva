'use client'

import { Button } from '@/core/ui/button'

import { zhNameOf } from '../templates-editor/featured-card'
import type { AdminTemplate } from '../templates/types'
import { SortableList } from '../ui/sortable'
import { LOCALE_DISPLAY_COPY as COPY } from './copy'
import { addable } from './display-state'
import type { DraftList } from './draft'
import { OwnBadge, SortableRow, StaticRow } from './rows'

type Props = {
  label: string
  list: DraftList
  templates: AdminTemplate[]
  editing: boolean
  onChange: (ids: string[]) => void
  onReset: () => void
}

export function FeaturedList({ label, list, templates, editing, onChange, onReset }: Props) {
  const templateOf = (id: string) => templates.find((template) => template.id === id)
  const nameOf = (id: string) => zhNameOf(templateOf(id), id)
  const detailOf = (id: string) => templateOf(id)?.categoryInfo.nameZh
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{label} · {COPY.featuredTitle}</h3>
        <OwnBadge own={list.own} />
        {editing && list.own ? <Button size="sm" variant="ghost" className="ml-auto" onClick={onReset}>{COPY.reset}</Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">{list.own ? COPY.featuredHint : COPY.featuredFollowing(list.ids.length)}</p>
      {list.ids.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.featuredEmpty}</p> : null}
      {editing ? (
        <>
          <SortableList ids={list.ids} labelOf={nameOf} onReorder={async (next) => onChange(next)}>
            {(shown) => (
              <ol className="grid gap-1">
                {shown.map((id) => (
                  <SortableRow key={id} id={id} name={nameOf(id)} detail={detailOf(id)} removeLabel={COPY.remove(nameOf(id))}
                    onRemove={() => onChange(list.ids.filter((other) => other !== id))} />
                ))}
              </ol>
            )}
          </SortableList>
          <label className="grid max-w-sm gap-1 text-sm">
            {COPY.addLabel}
            <select className="h-9 rounded-md border bg-background px-2" value=""
              onChange={(event) => event.target.value && onChange([...list.ids, event.target.value])}>
              <option value="">{COPY.addPlaceholder}</option>
              {addable(templates, list.ids).map((template) => (
                <option key={template.id} value={template.id}>{zhNameOf(template, template.id)}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <ol className="grid gap-1">
          {list.ids.map((id, index) => <StaticRow key={id} position={index + 1} name={nameOf(id)} detail={detailOf(id)} />)}
        </ol>
      )}
    </div>
  )
}
