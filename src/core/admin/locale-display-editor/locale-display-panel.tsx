'use client'

import { X } from 'lucide-react'
import { useState } from 'react'

import type { LocaleDisplay } from '@/core/templates/locale-display'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { DISPLAY_LOCALES, type DisplayLocale, type LocaleDisplayActions } from '../locale-display/types'
import { useAdminAction } from '../shell/use-admin-action'
import type { AdminCategoryNode } from '../template-categories/types'
import { zhNameOf } from '../templates-editor/featured-card'
import type { ActionResult, AdminTemplate } from '../templates/types'
import { DragHandle, MoveButtons, sortableRowClass, SortableList, useSortableItem } from '../ui/sortable'
import { LOCALE_DISPLAY_COPY as COPY } from './copy'
import { addable, featuredState, siblingGroups } from './display-state'

type Props = {
  categories: AdminCategoryNode[]
  templates: AdminTemplate[]
  display: LocaleDisplay
  actions: LocaleDisplayActions
}

const asValue = (result: ActionResult) => (result.ok ? { ok: true as const, value: undefined } : result)

// 分语言展示: the home page's category groups, Create's category bar and the home featured list,
// set separately for the English and the Chinese site. A language with nothing saved follows
// the shared order, so releasing this changes nothing until a group is arranged here.
export function LocaleDisplayPanel({ categories: all, templates, display, actions }: Props) {
  const [locale, setLocale] = useState<DisplayLocale>('en')
  const { pending, error, notice, run } = useAdminAction()
  const categories = all.filter((category) => !category.isSystem)
  const label = COPY.locales[locale]
  const groups = siblingGroups(categories, display, locale)
  const featured = featuredState(templates, display, locale)
  const nameOf = (key: string) => categories.find((category) => category.key === key)?.nameZh ?? key
  const templateOf = (id: string) => templates.find((template) => template.id === id)

  const order = (parent: string | null, keys: string[], done: string) =>
    run(async () => asValue(await actions.setCategoryOrder({ locale, parent, keys })), () => done)
  const saveFeatured = (ids: string[]) =>
    run(async () => asValue(await actions.setFeatured({ locale, ids })), () => (ids.length ? COPY.saved(label) : COPY.restored(label)))

  return (
    <section aria-labelledby="locale-display-h" className="grid gap-4 rounded-md border p-4">
      <div className="grid max-w-prose gap-1">
        <h2 id="locale-display-h" className="font-medium">{COPY.title}</h2>
        <p className="text-sm text-muted-foreground">{COPY.body}</p>
      </div>
      <div role="tablist" aria-label={COPY.title} className="flex gap-2">
        {DISPLAY_LOCALES.map((code) => (
          <Button key={code} role="tab" aria-selected={code === locale} size="sm" disabled={pending}
            variant={code === locale ? 'default' : 'outline'} onClick={() => setLocale(code)}>
            {COPY.locales[code]}
          </Button>
        ))}
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3">
        <div>
          <h3 className="text-sm font-medium">{label} · {COPY.categoriesTitle}</h3>
          <p className="text-xs text-muted-foreground">{COPY.categoriesHint}</p>
        </div>
        {groups.map((group) => (
          <div key={group.parent ?? 'root'} className="grid gap-1.5 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{group.title}</span>
              <span className={cn('rounded-full border px-2 py-0.5 text-xs', group.own ? 'border-primary/50 text-primary' : 'text-muted-foreground')}>
                {group.own ? COPY.own : COPY.following}
              </span>
              {group.own ? (
                <Button size="sm" variant="ghost" className="ml-auto" disabled={pending}
                  onClick={() => order(group.parent, [], COPY.restored(label))}>{COPY.reset}</Button>
              ) : null}
            </div>
            <SortableList ids={group.keys} disabled={pending} labelOf={nameOf}
              onReorder={async (next) => order(group.parent, next, COPY.saved(label))}>
              {(shown) => (
                <ol className="grid gap-1">
                  {shown.map((key) => <Row key={key} id={key} name={nameOf(key)} />)}
                </ol>
              )}
            </SortableList>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">{label} · {COPY.featuredTitle}</h3>
          <span className={cn('rounded-full border px-2 py-0.5 text-xs', featured.own ? 'border-primary/50 text-primary' : 'text-muted-foreground')}>
            {featured.own ? COPY.own : COPY.following}
          </span>
          {featured.own ? (
            <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={() => saveFeatured([])}>{COPY.reset}</Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{featured.own ? COPY.featuredHint : COPY.featuredFollowing(featured.ids.length)}</p>
        {featured.ids.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.featuredEmpty}</p> : null}
        <SortableList ids={featured.ids} disabled={pending} labelOf={(id) => zhNameOf(templateOf(id), id)}
          onReorder={async (next) => saveFeatured(next)}>
          {(shown) => (
            <ol className="grid gap-1">
              {shown.map((id) => (
                <Row key={id} id={id} name={zhNameOf(templateOf(id), id)} detail={templateOf(id)?.categoryInfo.nameZh}
                  onRemove={() => saveFeatured(featured.ids.filter((other) => other !== id))} removeLabel={COPY.remove(zhNameOf(templateOf(id), id))} pending={pending} />
              ))}
            </ol>
          )}
        </SortableList>
        <label className="grid max-w-sm gap-1 text-sm">
          {COPY.addLabel}
          <select className="h-9 rounded-md border bg-background px-2" disabled={pending} value=""
            onChange={(event) => event.target.value && saveFeatured([...featured.ids, event.target.value])}>
            <option value="">{COPY.addPlaceholder}</option>
            {addable(templates, featured.ids).map((template) => (
              <option key={template.id} value={template.id}>{zhNameOf(template, template.id)}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}

type RowProps = { id: string; name: string; detail?: string; onRemove?: () => void; removeLabel?: string; pending?: boolean }

function Row({ id, name, detail, onRemove, removeLabel, pending = false }: RowProps) {
  const item = useSortableItem(id)
  return (
    <li {...item.row} className={cn('flex items-center gap-1 rounded-md border bg-card px-1 py-0.5', sortableRowClass)}>
      <DragHandle handle={item.handle} />
      <span className="min-w-0 flex-1 truncate text-sm">{name}{detail ? <span className="text-muted-foreground"> · {detail}</span> : null}</span>
      <MoveButtons item={item} axis="column" />
      {onRemove ? (
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={pending}
          aria-label={removeLabel} onClick={onRemove}><X aria-hidden /></Button>
      ) : null}
    </li>
  )
}
