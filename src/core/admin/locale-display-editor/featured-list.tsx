'use client'

import { Button } from '@/core/ui/button'

import { zhNameOf } from '../templates-editor/featured-card'
import type { DisplayLocale } from '../locale-display/types'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { SortableList } from '../ui/sortable'
import { LOCALE_DISPLAY_COPY as COPY } from './copy'
import type { DraftList } from './draft'
import { FeaturedPicker } from './featured-picker'
import { OwnBadge, SortableRow, StaticRow } from './rows'

type Props = {
  locale: DisplayLocale
  label: string
  list: DraftList
  templates: AdminTemplate[]
  categories: AdminCategoryNode[]
  editing: boolean
  onChange: (ids: string[]) => void
  onReset: () => void
}

export function FeaturedList({ locale, label, list, templates, categories, editing, onChange, onReset }: Props) {
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
          <FeaturedPicker locale={locale} label={label} templates={templates} categories={categories} taken={list.ids}
            onAdd={(ids) => onChange([...list.ids, ...ids.filter((id) => !list.ids.includes(id))])} />
        </>
      ) : (
        <ol className="grid gap-1">
          {list.ids.map((id, index) => <StaticRow key={id} position={index + 1} name={nameOf(id)} detail={detailOf(id)} />)}
        </ol>
      )}
    </div>
  )
}
