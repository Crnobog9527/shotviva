'use client'

import { Plus } from 'lucide-react'

import { Button } from '@/core/ui/button'

import { zhNameOf } from '../templates-editor/featured-card'
import { SortableList } from '../ui/sortable'
import { BUNDLE_COPY as COPY } from './bundle-copy'
import { BundleDialog, type BundleContext } from './bundle-dialog'
import { SortableRow, StaticRow } from './rows'

type Props = {
  ids: string[]
  context: BundleContext
  editing: boolean
  onChange: (ids: string[]) => void
}

// A list of 精选组合 in order. Read: numbered names. Editing: drag or arrows, remove, add an
// existing bundle, or make a new one (saved at once, then added here).
export function BundleList({ ids, context, editing, onChange }: Props) {
  const byId = new Map(context.bundles.map((bundle) => [bundle.id, bundle]))
  const shown = ids.filter((id) => byId.has(id))
  const nameOf = (id: string) => byId.get(id)?.nameZh ?? id
  const detailOf = (id: string) => {
    const members = byId.get(id)?.templateIds ?? []
    return `${COPY.members(members.length)}：${members.map((member) => zhNameOf(context.templates.find((template) => template.id === member), member)).join('、')}`
  }
  if (!editing) {
    return (
      <ol className="grid grid-cols-1 gap-1">
        {shown.map((id, index) => <StaticRow key={id} position={index + 1} name={nameOf(id)} detail={detailOf(id)} />)}
      </ol>
    )
  }
  const others = context.bundles.filter((bundle) => !shown.includes(bundle.id))
  return (
    <div className="grid grid-cols-1 gap-2">
      <SortableList ids={shown} labelOf={nameOf} onReorder={async (next) => onChange(next)}>
        {(order) => (
          <ol className="grid grid-cols-1 gap-1">
            {order.map((id) => (
              <SortableRow key={id} id={id} name={nameOf(id)} detail={detailOf(id)} removeLabel={COPY.removeFromList(nameOf(id))}
                onRemove={() => onChange(shown.filter((other) => other !== id))} />
            ))}
          </ol>
        )}
      </SortableList>
      <div className="flex flex-wrap items-center gap-2">
        {others.length ? (
          <select aria-label={COPY.addExisting} className="h-8 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm" value=""
            onChange={(event) => event.target.value && onChange([...shown, event.target.value])}>
            <option value="">{COPY.addPlaceholder}</option>
            {others.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.nameZh}</option>)}
          </select>
        ) : null}
        <BundleDialog context={context} onSaved={(id) => onChange([...shown, id])}
          trigger={(open) => <Button size="sm" variant="outline" onClick={open}><Plus aria-hidden />{COPY.create}</Button>} />
      </div>
    </div>
  )
}
