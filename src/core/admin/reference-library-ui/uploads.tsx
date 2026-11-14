import { useEffect, useRef, useState } from 'react'
import { Button } from '@/core/ui/button'
import { UploadError } from '@/core/storage/upload'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'
import { uploadReference } from '@/core/admin/reference-library/upload-reference'
import { copy } from './copy'
import { CategoryOptions } from './category-options'
import type { ReferenceCategory } from './types'

type Row = { file: string; message: string; fraction?: number; existing?: string }
type Props = {
  selected: string | null
  categories: ReferenceCategory[]
  onDone(): void
  onOpen(id: string): void
}
function isTextField(el: EventTarget | null) {
  return el instanceof Element && !!el.closest('input,textarea,[contenteditable=true],[role=dialog]')
}

export function Uploads({ selected, categories, onDone, onOpen }: Props) {
  const [destination, setDestination] = useState({ onBranch: selected, key: selected ?? '' })
  const category = destination.onBranch === selected ? destination.key : selected ?? ''
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const validCategory = categories.some(item => item.key === category)

  async function start(files: File[]) {
    if (!canStart(files, lock.current, validCategory)) return
    lock.current = true
    setBusy(true)
    setRows(files.map(file => ({ file: file.name, message: copy.waiting })))
    function patch(index: number, patch: Partial<Row>) {
      setRows(previous => previous.map((row, i) => i === index ? { ...row, ...patch } : row))
    }
    const duplicates: string[] = []
    const created: string[] = []
    try {
      for (const [index, file] of files.entries()) {
        patch(index, { message: copy.preparing })
        const outcome = await uploadRow(file, category, status => patch(index, status))
        if (outcome) (outcome.duplicate ? duplicates : created).push(outcome.id)
      }
      if (created.length) onDone()
      if (duplicates.length) onOpen(duplicates[0])
    } finally { lock.current = false; setBusy(false) }
  }

  useEffect(() => {
    function paste(e: ClipboardEvent) {
      if (isTextField(e.target) || document.querySelector('[role=dialog]')) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (!files.length || !validCategory || lock.current) return
      e.preventDefault()
      void start(files)
    }
    document.addEventListener('paste', paste)
    return () => document.removeEventListener('paste', paste)
  })

  return <section className="grid gap-2 rounded-md border border-dashed p-3"
    onDragOver={e => { e.preventDefault() }}
    onDrop={e => { e.preventDefault(); void start(Array.from(e.dataTransfer.files)) }}>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">{copy.selectedCategory}
        <select className="max-w-full rounded border p-1" value={validCategory ? category : ''} disabled={busy}
          onChange={e => setDestination({ onBranch: selected, key: e.target.value })}>
          <option value="">{copy.chooseTarget}</option><CategoryOptions categories={categories} />
        </select></label>
      <Button variant="outline" size="sm" disabled={busy || !validCategory} onClick={() => input.current?.click()}>{copy.pick}</Button>
      <input type="file" ref={input} hidden multiple accept={UPLOAD_ACCEPT} onChange={e => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        void start(files)
      }} />
    </div>
    <p className="text-xs text-muted-foreground">{copy.drop} · {copy.files}</p>
    <ul aria-live="polite" className="max-h-52 space-y-1 overflow-y-auto text-xs">
      {rows.map((row, index) => <li key={index} className="flex flex-wrap items-center gap-2">
        <span className="max-w-72 truncate">{row.file}</span><span>{row.message}</span>
        {row.fraction !== undefined && <progress max={1} value={row.fraction} aria-label={row.file} />}
        {row.existing && <Button variant="link" size="xs" onClick={() => row.existing && onOpen(row.existing)}>{copy.openExisting}</Button>}
      </li>)}
    </ul>
  </section>
}

async function uploadRow(file: File, category: string, patch: (row: Partial<Row>) => void) {
  try {
    const result = await uploadReference(file, category, fraction => patch({ fraction }))
    patch({ message: result.duplicate ? copy.duplicate : copy.uploadedFile, existing: result.duplicate ? result.id : undefined, fraction: undefined })
    return result
  } catch (error) { patch({ message: uploadFailure(error), fraction: undefined }) }
}

function canStart(files: File[], busy: boolean, validCategory: boolean) { return files.length > 0 && !busy && validCategory }

function uploadFailure(error: unknown) {
  if (error instanceof UploadError) {
    if (error.code === 'IMAGE_TOO_LARGE') return copy.uploadSize
    if (error.code === 'IMAGE_UNSUPPORTED') return copy.uploadType
    return copy.uploadEncoding
  }
  return copy.failedUpload
}
