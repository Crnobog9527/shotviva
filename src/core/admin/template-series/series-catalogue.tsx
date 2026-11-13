'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Link } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Input } from '@/core/ui/input'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { ActionValue } from '../templates'
import { SortableList } from '../ui/sortable'
import { BatchBar, type BatchChoice } from './batch-bar'
import { seriesCopy as copy } from './copy'
import { OrderHelp } from './order-help'
import { selectionNames, type SeriesListItem } from './list-rules'
import { SERIES_PATH, SeriesRow } from './series-row'

export type SeriesListActions = {
  reorder: (ids: string[]) => Promise<ActionValue<number>>
  setFlag: (input: { ids: string[]; field: BatchChoice['field']; value: boolean; reason: string | null }) => Promise<ActionValue<number>>
}
type Props = { items: SeriesListItem[]; saved: boolean; production: boolean; actions: SeriesListActions }

// Saving in the dialog lands on ?saved=1 with the list still mounted, so the note follows the prop,
// not just its first value.
function useSavedMessage(saved: boolean) {
  const [message, setMessage] = useState(saved ? copy.saved : '')
  const [savedSeen, setSavedSeen] = useState(saved)
  if (saved !== savedSeen) {
    setSavedSeen(saved)
    if (saved) setMessage(copy.saved)
  }
  return [message, setMessage] as const
}

// 系列管理 (Owner 2026-11-12): drag the whole list into order (saved in one call), check series for
// a batch flag change, open a series in a dialog from its name.
export function SeriesCatalogue({ items, saved, production, actions }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useSavedMessage(saved)
  const [pending, run] = useTransition()
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const ids = items.map(item => item.id)
  const query = filter.trim().toLowerCase()
  const visible = (id: string) => !query || (byId.get(id)?.name_zh.toLowerCase().includes(query) ?? false)
  const shown = ids.filter(visible)
  const allChecked = shown.length > 0 && shown.every(id => selected.has(id))

  const select = (id: string, on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })
  async function reorder(next: string[]) {
    const result = await actions.reorder(next).catch(() => null)
    setMessage(result?.ok ? copy.orderSaved : result?.message ?? copy.orderFailed)
    router.refresh()
  }
  function apply(choice: BatchChoice, reason: string | null) {
    const chosen = [...selected]
    run(async () => {
      const result = await actions.setFlag({ ids: chosen, field: choice.field, value: choice.value, reason }).catch(() => null)
      if (result?.ok) {
        setMessage(copy.batchDone(choice.label, result.value, chosen.length))
        setSelected(new Set())
      } else setMessage(result?.message ?? copy.transient)
      router.refresh()
    })
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 p-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="mr-auto text-xl font-semibold">{copy.title}</h1>
        <Link className="text-sm underline" href="/admin/templates">{copy.templates}</Link>
        <Button asChild><Link href={SERIES_PATH + '?new=1'} scroll={false}>{copy.create}</Link></Button>
      </header>
      {production && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{copy.productionNote}</p>}
      <OrderHelp />
      {message && <p role="status" className="text-sm">{message}</p>}
      <Input type="search" className="max-w-md" aria-label={copy.seriesSearch} placeholder={copy.seriesSearch} maxLength={160}
        value={filter} onChange={event => setFilter(event.target.value)} />
      {selected.size > 0 && <BatchBar names={selectionNames(items, selected)} pending={pending} clear={() => setSelected(new Set())} apply={apply} />}
      {shown.length ? (
        <Table>
          <TableHeader><TableRow>
            <TableHead><Checkbox aria-label={copy.selectAll} checked={allChecked}
              onCheckedChange={on => setSelected(on === true ? new Set([...selected, ...shown]) : new Set([...selected].filter(id => !shown.includes(id))))} /></TableHead>
            {[copy.drag, copy.cover, copy.name_zh, copy.status, copy.selectStatus].map(label => <TableHead key={label}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            <SortableList ids={ids} labelOf={id => byId.get(id)?.name_zh ?? id} onReorder={reorder}
              disabled={pending || !!query} disabledHint={query ? copy.dragFiltered : undefined}>
              {order => order.filter(visible).map(id => {
                const item = byId.get(id)
                return item && <SeriesRow key={id} item={item} checked={selected.has(id)} onSelect={on => select(id, on)} />
              })}
            </SortableList>
          </TableBody>
        </Table>
      ) : <p className="text-muted-foreground text-sm">{query ? copy.noSeriesMatch : copy.empty}</p>}
    </main>
  )
}
