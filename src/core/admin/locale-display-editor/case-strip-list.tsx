'use client'

import { Plus } from 'lucide-react'

import type { CaseStripEntry } from '@/core/templates/home-case-strip'
import { Button } from '@/core/ui/button'

import type { DisplayLocale } from '../locale-display/types'
import { zhNameOf } from '../templates-editor/featured-card'
import { SortableList } from '../ui/sortable'
import { BundleDialog, type BundleContext } from './bundle-dialog'
import { CASE_STRIP_COPY as COPY } from './case-strip-copy'
import { addEntries, keyOf, removeEntry, reorderEntries, slotsLeft } from './case-strip-draft'
import { featurable } from './display-state'
import { FeaturedPicker } from './featured-picker'
import { SortableRow, StaticRow } from './rows'

type Props = {
  locale: DisplayLocale
  label: string
  list: CaseStripEntry[]
  context: BundleContext
  editing: boolean
  onChange: (list: CaseStripEntry[]) => void
}

// How a row reads: the template's or bundle's Chinese name, then what it is and whether the
// home page can show it.
function describe(entry: CaseStripEntry, context: BundleContext): { name: string; detail: string } {
  if (entry.kind === 'template') {
    const template = context.templates.find((one) => one.id === entry.id)
    const state = featurable(template) ? template.categoryInfo.nameZh : COPY.notLive
    return { name: zhNameOf(template, entry.id), detail: `${COPY.template} · ${state}` }
  }
  const bundle = context.bundles.find((one) => one.id === entry.id)
  if (!bundle) return { name: entry.id, detail: `${COPY.bundle} · ${COPY.missing}` }
  const names = bundle.templateIds.map((id) => zhNameOf(context.templates.find((one) => one.id === id), id)).join('、')
  return { name: bundle.nameZh, detail: `${COPY.bundle} · ${COPY.members(bundle.templateIds.length)}：${names}` }
}

// The language's entries in order. Read: numbered rows. Editing: drag or arrows, remove, add
// templates from the cover grid, add an existing bundle or make a new one (saved at once).
export function CaseStripList({ locale, label, list, context, editing, onChange }: Props) {
  const keys = list.map(keyOf)
  const textOf = (key: string) => describe(list[keys.indexOf(key)] ?? { kind: 'template', id: key }, context)
  if (!editing) {
    if (list.length === 0) return <p className="text-sm text-muted-foreground">{COPY.builtIn}</p>
    return (
      <ol className="grid grid-cols-1 gap-1">
        {keys.map((key, index) => <StaticRow key={key} position={index + 1} {...textOf(key)} />)}
      </ol>
    )
  }
  const left = slotsLeft(list)
  const add = (added: CaseStripEntry[]) => onChange(addEntries(list, added))
  return (
    <div className="grid grid-cols-1 gap-2">
      <SortableList ids={keys} labelOf={(key) => textOf(key).name} onReorder={async (next) => onChange(reorderEntries(next))}>
        {(order) => (
          <ol className="grid grid-cols-1 gap-1">
            {order.map((key) => (
              <SortableRow key={key} id={key} {...textOf(key)} removeLabel={COPY.remove(textOf(key).name)} onRemove={() => onChange(removeEntry(list, key))} />
            ))}
          </ol>
        )}
      </SortableList>
      {left === 0 ? <p className="text-xs text-muted-foreground">{COPY.full}</p> : null}
      <AddControls locale={locale} label={label} list={list} context={context} left={left} add={add} />
    </div>
  )
}

type AddProps = { locale: DisplayLocale; label: string; list: CaseStripEntry[]; context: BundleContext; left: number; add: (added: CaseStripEntry[]) => void }

function AddControls({ locale, label, list, context, left, add }: AddProps) {
  const taken = list.filter((entry) => entry.kind === 'template').map((entry) => entry.id)
  const others = context.bundles.filter((bundle) => !list.some((entry) => entry.kind === 'bundle' && entry.id === bundle.id))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FeaturedPicker locale={locale} label={label} templates={context.templates} categories={context.categories} taken={taken} max={left} text={COPY.picker}
        onAdd={(ids) => add(ids.map((id) => ({ kind: 'template', id })))} />
      {others.length ? (
        <select aria-label={COPY.addBundle} disabled={left === 0} className="h-8 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm" value=""
          onChange={(event) => event.target.value && add([{ kind: 'bundle', id: event.target.value }])}>
          <option value="">{COPY.addBundlePlaceholder}</option>
          {others.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.nameZh}</option>)}
        </select>
      ) : null}
      <BundleDialog context={context} onSaved={(id) => add([{ kind: 'bundle', id }])}
        trigger={(open) => <Button size="sm" variant="outline" disabled={left === 0} onClick={open}><Plus aria-hidden />{COPY.createBundle}</Button>} />
    </div>
  )
}
