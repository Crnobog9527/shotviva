import { useEffect, useState } from 'react'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/core/ui/dialog'
import { DetailFields } from './detail-fields'
import { errorMessage, batchAssets, previewUrl, updateAsset } from './api'
import { copy } from './copy'
import type { AssetUpdate, ReferenceAsset, ReferenceCategory } from './types'

type Props = {
  asset: ReferenceAsset
  categories: ReferenceCategory[]
  neighbors: { previous?: ReferenceAsset; next?: ReferenceAsset }
  onOpen(asset: ReferenceAsset): void
  onClose(): void
  onChange(): void
  initiallyEditing?: boolean
}

export function AssetDetail({ asset, categories, neighbors, onOpen, onClose, onChange, initiallyEditing = false }: Props) {
  const [editing, setEditing] = useState(initiallyEditing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function mutate(action: () => Promise<unknown>, done: () => void) {
    setError('')
    setBusy(true)
    try { await action(); onChange(); done() }
    catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const archive = () => void mutate(() => batchAssets({ ids: [asset.id], operation: asset.status === 'active' ? 'archive' : 'restore' }), onClose)
  const save = (value: AssetUpdate) => void mutate(() => updateAsset(asset.id, value), () => { setEditing(false); onOpen({ ...asset, ...value }) })
  const inactive = busy || editing
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (inactive || ignoreShortcut(e)) return
      const key = e.key.toLowerCase()
      if (key === 'arrowleft' && neighbors.previous) onOpen(neighbors.previous)
      else if (key === 'arrowright' && neighbors.next) onOpen(neighbors.next)
      else if (key === 'e') setEditing(true)
      else if (key === 'a' && asset.status === 'active') archive()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  })
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 content-start overflow-auto rounded-none sm:max-w-xl">
      <DialogTitle>{copy.detail}</DialogTitle><DialogDescription>{copy.copyright}</DialogDescription>
      {/* eslint-disable-next-line @next/next/no-img-element -- Private media requires the viewer's session. */}
      <img src={previewUrl(asset.id)} alt={asset.note ?? ''} width={asset.width} height={asset.height} className="max-h-[48vh] w-full rounded bg-muted object-contain" />
      <p className="text-sm text-muted-foreground">{asset.width} × {asset.height} · {Math.ceil(asset.bytes / 1024)} KB · {copy.used(asset.usedInTemplates)}</p>
      {editing ? <DetailFields asset={asset} categories={categories} onSave={save} onCancel={() => setEditing(false)} busy={busy} /> :
        <AssetFacts asset={asset} categories={categories} />}
      {!editing && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>{copy.edit} (E)</Button>
        <Button variant="outline" disabled={busy} onClick={archive}>{asset.status === 'active' ? copy.archive + ' (A)' : copy.restore}</Button>
        <Button variant="ghost" disabled={!neighbors.previous || busy} onClick={() => neighbors.previous && onOpen(neighbors.previous)}>{copy.previous}</Button>
        <Button variant="ghost" disabled={!neighbors.next || busy} onClick={() => neighbors.next && onOpen(neighbors.next)}>{copy.next}</Button>
      </div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>
}

function AssetFacts({ asset, categories }: Pick<Props, 'asset' | 'categories'>) {
  const name = categories.find(cat => cat.key === asset.categoryId)?.nameZh
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 break-words text-sm">
    <dt>{copy.category}</dt><dd>{name ?? asset.categoryId} {asset.status === 'archived' && copy.viewingArchived}</dd>
    <dt>{copy.source}</dt><dd className="min-w-0 break-all">{asset.sourceUrl ? <a className="underline" href={asset.sourceUrl} target="_blank" rel="noreferrer">{asset.sourceUrl}</a> : copy.none}</dd>
    <dt>{copy.note}</dt><dd className="whitespace-pre-wrap">{asset.note || copy.none}</dd>
    <dt>{copy.tag}</dt><dd>{asset.tags.join(' · ') || copy.none}</dd>
    <dt>{copy.uploaded}</dt><dd>{new Date(asset.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</dd>
  </dl>
}

function ignoreShortcut(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey || event.altKey || event.repeat
}
