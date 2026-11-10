'use client'

import { useState } from 'react'
import { listManagedAssets, removeTestAssets, type AssetCursor, type AssetKind, type ManagedAsset } from './api'
import { TEST_RUN_COPY as COPY } from './copy'
import { failureMessage } from './messages'

export type AssetManagerOptions = {
  kind: AssetKind
  template?: string
  onRemoved: (ids: string[]) => void
  onError: (error: string) => void
  onNotice: (notice: string) => void
}

export function useAssetManager({ kind, template, onRemoved, onError, onNotice }: AssetManagerOptions) {
  const [open, setOpen] = useState(false)
  const [ids, setIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<ManagedAsset[]>([])
  const [next, setNext] = useState<AssetCursor | null>(null)
  const load = async (cursor?: AssetCursor) => {
    setBusy(true)
    try {
      const page = await listManagedAssets(kind, template, cursor)
      setItems(previous => cursor ? [...previous, ...page.items] : page.items)
      setNext(page.next)
    } catch (error) { onError(failureMessage(error)); setOpen(false) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try {
      const preview = await removeTestAssets(kind, ids)
      const message = kind === 'photo' ? COPY.removal.photoWarning : COPY.removal.runWarning
      if (!window.confirm(message(preview.count, preview.uses))) return
      const result = await removeTestAssets(kind, ids, preview.uses)
      onRemoved(ids)
      onNotice(result.pending ? COPY.removal.queued : COPY.removal.done)
      setOpen(false)
    } catch (error) { onError(failureMessage(error)); setOpen(false) }
    finally { setBusy(false) }
  }
  const show = () => {
    setIds([])
    setItems([])
    setNext(null)
    setOpen(true)
    void load()
  }
  const changeOpen = (value: boolean) => { if (!busy) setOpen(value) }
  const toggle = (id: string) => setIds(current => current.includes(id) ? current.filter(key => key !== id) : [...current, id])
  return { open, ids, busy, items, next, load, remove, show, changeOpen, toggle }
}
