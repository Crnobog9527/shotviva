'use client'

import { useRef, useState } from 'react'

import { MAX_STYLE_REFS, type StyleRef } from '@/core/templates/style-refs'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { DragHandle, MoveButtons, SortableList, sortableRowClass, useSortableItem } from '../ui/sortable'
import { styleRefCopy as copy } from './copy'
import type { referenceBudget } from './style-ref-state'
import { uploadStyleRef } from './style-ref-upload'

type Props = {
  templateId: string | null
  refs: StyleRef[]
  budget: ReturnType<typeof referenceBudget>
  busy: boolean
  onBusy: (busy: boolean) => void
  onChange: (refs: StyleRef[]) => void
}

export function StyleRefFields({ templateId, refs, budget, busy, onBusy, onChange }: Props) {
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | null>(null)
  const pick = (key: string | null) => {
    replacing.current = key
    picker.current?.click()
  }
  const upload = async (file: File) => {
    if (!templateId) return
    const replaced = replacing.current
    onBusy(true)
    setError('')
    try {
      const ref = await uploadStyleRef(templateId, file)
      onChange(replaced ? refs.map(old => old.key === replaced ? ref : old) : [...refs, ref])
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.invalidUpload)
    } finally {
      onBusy(false)
    }
  }
  const keys = refs.map(ref => ref.key)
  const reorder = async (order: string[]) => onChange(order.flatMap(key => refs.filter(ref => ref.key === key)))
  return (
    <fieldset className="grid gap-2 rounded-md border p-3 text-sm" disabled={busy}>
      <legend className="px-1 font-medium">{copy.title}</legend>
      <p className="text-xs text-muted-foreground">{copy.orderHint}</p>
      <p className="text-xs text-muted-foreground">{copy.rightsHint}</p>
      <p>{copy.limit(budget.users, refs.length, budget.max)}</p>
      <SortableList ids={keys} labelOf={key => copy.label(keys.indexOf(key) + 1)} onReorder={reorder} disabled={busy}>
        {order => <ol className="grid gap-1">{order.map((key, i) => (
          <RefRow key={key} refKey={key} label={copy.label(i + 1)} pick={pick} remove={() => onChange(refs.filter(r => r.key !== key))} />
        ))}</ol>}
      </SortableList>
      <input ref={picker} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void upload(file)
      }} />
      {templateId ? (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => pick(null)} disabled={busy || refs.length >= MAX_STYLE_REFS}>
          {copy.add}
        </Button>
      ) : <p className="text-xs">{copy.needSave}</p>}
      {busy && <p role="status">{copy.uploading}</p>}
      {(error || budget.problem) && <p role="alert" className="text-destructive">{error || budget.problem}</p>}
    </fieldset>
  )
}

function RefRow({ refKey, label, pick, remove }: { refKey: string; label: string; pick: (key: string) => void; remove: () => void }) {
  const item = useSortableItem(refKey)
  const [, templateId, filename] = refKey.split('/')
  const query = new URLSearchParams({ templateId, imageId: filename.slice(0, -5) })
  return (
    <li {...item.row} className={cn('flex items-center gap-2 rounded-md border p-1', sortableRowClass)}>
      <DragHandle handle={item.handle} />
      {/* A same-origin admin gate signs the private image only when the dialog opens. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="size-12 rounded object-contain" alt={label} src={`/api/admin/style-refs?${query}`} referrerPolicy="no-referrer" />
      <MoveButtons item={item} />
      <Button type="button" variant="outline" size="sm" onClick={() => pick(refKey)}>{copy.replace}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={remove}>{copy.remove}</Button>
    </li>
  )
}
