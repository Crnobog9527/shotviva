'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Link } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { ActionValue } from '../templates'
import type { DeletedSeries } from './batch'
import { BatchBar, type BatchChoice } from './batch-bar'
import { seriesCopy as copy } from './copy'
import { DeleteResult } from './delete-result'
import { DeleteSeriesDialog } from './delete-series-dialog'
import { DeletedSeriesList } from './deleted-series-list'
import { OrderHelp } from './order-help'
import { selectionNames, type SeriesListItem } from './list-rules'
import { SERIES_PATH } from './series-row'
import { SeriesTable } from './series-table'
import { useSeriesDelete, type DeleteSeries } from './use-series-delete'

export type SeriesListActions = {
  reorder: (ids: string[]) => Promise<ActionValue<number>>
  setFlag: (input: { ids: string[]; field: BatchChoice['field']; value: boolean; reason: string | null }) => Promise<ActionValue<number>>
  remove: DeleteSeries
}
type Props = { items: SeriesListItem[]; deleted: DeletedSeries[]; saved: boolean; production: boolean; actions: SeriesListActions }

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

function useSelection(shown: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const select = (id: string, on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })
  const setAll = (on: boolean) => setSelected(prev => on ? new Set([...prev, ...shown]) : new Set([...prev].filter(id => !shown.includes(id))))
  return { selected, select, setAll, clear: () => setSelected(new Set()) }
}

function Tabs({ showDeleted, counts, onChange }: { showDeleted: boolean; counts: [number, number]; onChange: (deleted: boolean) => void }) {
  return (
    <div role="tablist" className="flex gap-2">
      {[false, true].map(deleted => (
        <Button key={String(deleted)} role="tab" aria-selected={showDeleted === deleted} size="sm"
          variant={showDeleted === deleted ? 'default' : 'outline'} onClick={() => onChange(deleted)}>
          {deleted ? copy.tabDeleted(counts[1]) : copy.tabAll(counts[0])}
        </Button>
      ))}
    </div>
  )
}

// 系列管理 (Owner 2026-11-12): drag the whole list into order (saved in one call), check series for
// a batch flag change or 删除 (2026-11-14), open a series in a dialog from its name.
export function SeriesCatalogue({ items, deleted, saved, production, actions }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [message, setMessage] = useSavedMessage(saved)
  const [flagPending, run] = useTransition()
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const ids = items.map(item => item.id)
  const query = filter.trim().toLowerCase()
  const visible = (id: string) => !query || (byId.get(id)?.name_zh.toLowerCase().includes(query) ?? false)
  const shown = ids.filter(visible)
  const selection = useSelection(shown)
  const removal = useSeriesDelete(actions.remove, selection.clear)
  const pending = flagPending || removal.pending

  async function reorder(next: string[]) {
    const result = await actions.reorder(next).catch(() => null)
    setMessage(result?.ok ? copy.orderSaved : result?.message ?? copy.orderFailed)
    router.refresh()
  }
  function apply(choice: BatchChoice, reason: string | null) {
    const chosen = [...selection.selected]
    run(async () => {
      const result = await actions.setFlag({ ids: chosen, field: choice.field, value: choice.value, reason }).catch(() => null)
      if (result?.ok) {
        setMessage(copy.batchDone(choice.label, result.value, chosen.length))
        selection.clear()
      } else setMessage(result?.message ?? copy.transient)
      router.refresh()
    })
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="mr-auto text-xl font-semibold">{copy.title}</h1>
        <Link className="text-sm underline" href="/admin/templates">{copy.templates}</Link>
        <Button asChild><Link href={SERIES_PATH + '?new=1'} scroll={false}>{copy.create}</Link></Button>
      </header>
      {production && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{copy.productionNote}</p>}
      <OrderHelp />
      {message && <p role="status" className="text-sm">{message}</p>}
      <DeleteResult state={removal} />
      <Tabs showDeleted={showDeleted} counts={[items.length, deleted.length]} onChange={setShowDeleted} />
      {showDeleted ? <DeletedSeriesList items={deleted} /> : <>
        <Input type="search" className="max-w-md" aria-label={copy.seriesSearch} placeholder={copy.seriesSearch} maxLength={160}
          value={filter} onChange={event => setFilter(event.target.value)} />
        {selection.selected.size > 0 && <BatchBar names={selectionNames(items, selection.selected)} pending={pending} clear={selection.clear} apply={apply}
          remove={() => removal.open(items.filter(item => selection.selected.has(item.id)))} />}
        {shown.length
          ? <SeriesTable ids={ids} byId={byId} visible={visible} query={query} pending={pending} selection={selection}
            onReorder={reorder} onDelete={item => removal.open([item])} />
          : <p className="text-muted-foreground text-sm">{query ? copy.noSeriesMatch : copy.empty}</p>}
      </>}
      <DeleteSeriesDialog items={removal.target} pending={removal.pending} production={production}
        onCancel={removal.cancel} onConfirm={removal.confirm} />
    </main>
  )
}
