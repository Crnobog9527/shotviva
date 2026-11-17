'use client'

import { useRef, useState } from 'react'

import { MAX_STYLE_REFS, type StyleRef } from '@/core/templates/style-refs'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { DragHandle, MoveButtons, SortableList, sortableRowClass, useSortableItem } from '../ui/sortable'
import { styleRefCopy as copy } from './copy'
import type { referenceBudget } from './style-ref-state'
import { isRefFromAfterCover, type AfterCover } from '../covers/client'
import { reuseAfterCover, uploadStyleRef } from './style-ref-upload'
import { PreviewThumb } from '../ui/image-preview'
import { styleRefUrl } from './style-ref-url'
import { useFileDrop } from '../ui/use-file-drop'

type Props = {
  cover: AfterCover | null
  templateId: string | null
  refs: StyleRef[]
  budget: ReturnType<typeof referenceBudget>
  busy: boolean
  onBusy: (busy: boolean) => void
  onChange: (refs: StyleRef[]) => void
}

function reuseHint(cover: AfterCover | null, refs: StyleRef[]) {
  if (refs.length >= MAX_STYLE_REFS) return copy.full
  if (!cover) return copy.noAfter
  return refs.some(ref => isRefFromAfterCover(ref.key, cover.hash)) ? copy.alreadyAdded : ''
}

export function StyleRefFields({ cover, templateId, refs, budget, busy, onBusy, onChange }: Props) {
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | null>(null)
  const pick = (key: string | null) => {
    replacing.current = key
    picker.current?.click()
  }
  const inFlight = useRef(false)
  const full = refs.length >= MAX_STYLE_REFS
  const hint = reuseHint(cover, refs)
  const add = async (load: () => Promise<StyleRef>, replaced: string | null) => {
    if (inFlight.current) return
    inFlight.current = true
    onBusy(true)
    setError('')
    try {
      const ref = await load()
      onChange(replaced ? refs.map(old => old.key === replaced ? ref : old) : [...refs, ref])
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.invalidUpload)
    } finally {
      inFlight.current = false
      onBusy(false)
    }
  }
  const keys = refs.map(ref => ref.key)
  const reorder = async (order: string[]) => onChange(order.flatMap(key => refs.filter(ref => ref.key === key)))
  const upload = (file: File, replaced: string | null) => {
    if (templateId && !busy && (replaced || !full)) void add(() => uploadStyleRef(templateId, file), replaced)
  }
  return (
    <fieldset className="grid gap-2 rounded-md border p-3 text-sm" disabled={busy}>
      <legend className="px-1 font-medium">{copy.title}</legend>
      <p className="text-xs text-muted-foreground">{copy.orderHint}</p>
      <p className="text-xs text-muted-foreground">{copy.rightsHint}</p>
      <p>{copy.limit(budget.users, refs.length, budget.total, budget.model)}</p>
      <SortableList ids={keys} labelOf={key => copy.label(keys.indexOf(key) + 1)} onReorder={reorder} disabled={busy}>
        {order => <ol className="grid gap-1">{order.map((key, i) => (
          <RefRow key={key} refKey={key} label={copy.label(i + 1)} pick={pick} busy={busy || !templateId}
            upload={upload} remove={() => onChange(refs.filter(r => r.key !== key))} />
        ))}</ol>}
      </SortableList>
      <input ref={picker} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) upload(file, replacing.current)
      }} />
      {templateId ? (
        <div className="flex flex-wrap items-center gap-2">
          <AddRefDropZone disabled={busy || full} pick={() => pick(null)} upload={file => upload(file, null)} />
          <Button type="button" variant="outline" size="sm" disabled={busy || !!hint}
            onClick={() => cover && void add(() => reuseAfterCover(templateId, cover), null)}>{copy.reuse}</Button>
        </div>
      ) : <p className="text-xs">{copy.needId}</p>}
      {templateId && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {busy && <p role="status">{copy.uploading}</p>}
      {(error || budget.problem) && <p role="alert" className="text-destructive">{error || budget.problem}</p>}
    </fieldset>
  )
}

function AddRefDropZone({ disabled, pick, upload }: { disabled: boolean; pick: () => void; upload: (file: File) => void }) {
  const drop = useFileDrop(upload, disabled)
  return (
    <div onClickCapture={drop.clearError} onDragOver={drop.onDragOver} onDragLeave={drop.onDragLeave} onDrop={drop.onDrop}
      className={cn('flex flex-wrap items-center gap-2 rounded-md', drop.active && 'ring-primary ring-2')}>
      <Button type="button" variant="outline" size="sm" onClick={pick} disabled={disabled}>{copy.add}</Button>
      <span className="text-xs text-muted-foreground">或拖放图片到这里</span>
      {drop.error && <span role="alert" className="text-destructive text-xs">{drop.error}</span>}
    </div>
  )
}

function RefRow({ refKey, label, pick, upload, remove, busy }: { refKey: string; label: string; pick: (key: string) => void; upload: (file: File, replaced: string) => void; remove: () => void; busy: boolean }) {
  const item = useSortableItem(refKey)
  const url = styleRefUrl(refKey)
  const drop = useFileDrop(file => upload(file, refKey), busy)
  return (
    <li {...item.row} onClickCapture={drop.clearError} onDragOver={drop.onDragOver} onDragLeave={drop.onDragLeave} onDrop={drop.onDrop}
      className={cn('flex flex-wrap items-center gap-2 rounded-md border p-1', sortableRowClass, drop.active && 'border-primary ring-primary ring-2')}>
      <DragHandle handle={item.handle} />
      {/* A same-origin admin gate signs the private image only when it is drawn; the large view reads the same gate. */}
      <PreviewThumb title={label} images={url ? [{ url, label }] : []}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="size-12 rounded object-contain" alt={label} src={url ?? undefined} referrerPolicy="no-referrer" />
      </PreviewThumb>
      <MoveButtons item={item} />
      <Button type="button" variant="outline" size="sm" onClick={() => pick(refKey)}>{copy.replace}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={remove}>{copy.remove}</Button>
      <span className="text-xs text-muted-foreground">拖入图片可替换</span>
      {drop.error && <span role="alert" className="text-destructive text-xs">{drop.error}</span>}
    </li>
  )
}
