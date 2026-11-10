'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AssetDetail } from './asset-detail'
import { Categories } from './categories'
import { Filters, type Display } from './filters'
import { Results } from './results'
import { Uploads } from './uploads'
import { getAsset } from './api'
import { copy } from './copy'
import { initialFilter, type AssetFilter, type AssetPage, type ReferenceAsset, type ReferenceCategory } from './types'

type Props = { categories: ReferenceCategory[]; initialPage: AssetPage }
type Detail = { asset: ReferenceAsset; items: ReferenceAsset[] }

export function ReferenceLibrary({ categories, initialPage }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState(initialFilter)
  const [display, setDisplay] = useState<Display>('compact')
  const [revision, setRevision] = useState(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  function changeFilter(patch: Partial<AssetFilter>) {
    setFilter(previous => {
      const next = { ...previous, ...patch }
      return JSON.stringify(next) === JSON.stringify(previous) ? previous : next
    })
  }
  const changed = () => setRevision(previous => previous + 1)
  async function openById(id: string) {
    setError('')
    try { setDetail({ asset: await getAsset(id), items: [] }) }
    catch { setError(copy.fetchFailed) }
  }
  const key = JSON.stringify(filter)
  const initial = revision === 0 && key === JSON.stringify(initialFilter) ? initialPage : undefined
  return <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(19rem,1fr)_minmax(0,2fr)]">
    <Categories categories={categories} selected={filter.categoryId} onSelect={categoryId => changeFilter({ categoryId })}
      onChange={() => { changed(); router.refresh() }} />
    <section className="grid min-w-0 gap-4">
      <Filters filter={filter} onChange={changeFilter} display={display} onDisplay={setDisplay} />
      {filter.status === 'active' && <Uploads categories={categories} selected={filter.categoryId} onDone={changed} onOpen={id => void openById(id)} />}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Results key={`${key}:${revision}`} filter={filter} initial={initial} display={display} categories={categories} onChange={changed}
        onOpen={(asset, items) => setDetail({ asset, items })} />
    </section>
    {detail && <DetailView detail={detail} categories={categories} onClose={() => setDetail(null)} onChange={changed} onOpen={setDetail} />}
  </div>
}
function DetailView({ detail, categories, onClose, onChange, onOpen }: {
  detail: Detail; categories: ReferenceCategory[]; onClose(): void; onChange(): void; onOpen(detail: Detail): void
}) {
  const index = detail.items.findIndex(item => item.id === detail.asset.id)
  return <AssetDetail key={detail.asset.id} asset={detail.asset} categories={categories}
    neighbors={{ previous: detail.items[index - 1], next: index >= 0 ? detail.items[index + 1] : undefined }}
    onOpen={asset => onOpen({ asset, items: detail.items.map(item => item.id === asset.id ? asset : item) })} onClose={onClose} onChange={onChange} />
}
