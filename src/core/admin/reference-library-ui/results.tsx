import { useRef, useState } from 'react'
import { Button } from '@/core/ui/button'
import { AssetGrid } from './asset-grid'
import { BatchTools } from './batch-tools'
import { errorMessage, batchAssets } from './api'
import { copy } from './copy'
import { toggleRange } from './selection'
import { useAssetPage } from './use-asset-page'
import type { Display } from './filters'
import type { AssetFilter, AssetPage, BatchInput, ReferenceAsset, ReferenceCategory } from './types'

type Props = {
  filter: AssetFilter
  categories: ReferenceCategory[]
  initial?: AssetPage
  display: Display
  onChange(): void
  onOpen(asset: ReferenceAsset, items: ReferenceAsset[]): void
}
export function Results({ filter, categories, initial, display, onChange, onOpen }: Props) {
  const { page, loading, failed, sentinel, load } = useAssetPage(filter, initial)
  const [selected, setSelected] = useState(new Set<string>())
  const anchor = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ids = page.items.map(item => item.id)
  function toggle(id: string, range: boolean) {
    if (busy) return
    const next = toggleRange(selected, ids, id, anchor.current, range)
    if (next.size > 200) { setError(copy.batchLimit); return }
    setError('')
    setSelected(next)
    if (!range) anchor.current = id
  }
  async function submit(input: BatchInput) {
    setBusy(true)
    setError('')
    try { await batchAssets(input); onChange(); return true }
    catch (error) { setError(errorMessage(error)); return false }
    finally { setBusy(false) }
  }
  const { empty, showNext } = loadFlags(page, loading, failed)
  return <div className="grid gap-3" aria-busy={loading || busy}>
    {selected.size > 0 && <BatchTools ids={[...selected]} status={filter.status} categories={categories} onClear={() => { setSelected(new Set()); anchor.current = null; setError('') }}
      busy={busy} error={error} onSubmit={submit} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <AssetGrid items={page.items} selected={selected} display={display} onToggle={toggle} onOpen={asset => onOpen(asset, page.items)} />
    {empty && <p className="rounded border p-5 text-muted-foreground">{copy.empty}</p>}
    {loading && <p role="status">{copy.loading}</p>}
    {failed && <p role="alert">{copy.fetchFailed}</p>}
    {showNext && <Button ref={sentinel} variant="outline" disabled={loading} onClick={() => void load(page.nextCursor)}>
      {failed ? copy.retry : copy.more}
    </Button>}
  </div>
}

function loadFlags(page: AssetPage, loading: boolean, failed: boolean) {
  return { empty: !page.items.length && !loading && !failed, showNext: Boolean(page.nextCursor) || failed }
}
