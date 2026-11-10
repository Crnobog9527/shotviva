import { useState } from 'react'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { CategoryOptions } from './category-options'
import { copy } from './copy'
import { tagList, validTags } from './selection'
import type { AssetOperation, BatchInput, ReferenceCategory, ReferenceStatus } from './types'

type Props = {
  ids: string[]
  status: ReferenceStatus
  categories: ReferenceCategory[]
  onClear(): void
  onSubmit(input: BatchInput): Promise<boolean>
  busy: boolean
  error: string
}
const label: Record<AssetOperation, string> = {
  move: copy.move, 'add-tags': copy.addTags, 'remove-tags': copy.removeTags, archive: copy.archive, restore: copy.restore, delete: copy.delete,
}

export function BatchTools({ ids, categories, status, onClear, onSubmit, busy, error }: Props) {
  const [mode, setMode] = useState<AssetOperation | null>(null)
  const [value, setValue] = useState('')
  const operations: AssetOperation[] = ['move', 'add-tags', 'remove-tags', ...(status === 'archived' ? ['restore', 'delete'] as const : ['archive'] as const)]
  const close = () => { setMode(null); setValue('') }
  async function submit(operation: AssetOperation) {
    const body: BatchInput = { ids, operation }
    if (operation === 'move') body.categoryId = value
    if (operation.endsWith('tags')) body.tags = tagList(value)
    if (await onSubmit(body)) close()
  }
  return <>
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
      <span className="text-sm">{copy.selected(ids.length)}</span>
      {operations.map(op => <Button key={op} size="sm" variant={op === 'delete' ? 'destructive' : 'outline'}
        disabled={busy} onClick={() => {
          if (op === 'archive' || op === 'restore') void submit(op)
          else { setValue(''); setMode(op) }
        }}>{label[op]}</Button>)}
      <Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>{copy.clear}</Button>
    </div>
    {mode && <Dialog open onOpenChange={open => { if (!open && !busy) close() }}>
      <DialogContent aria-describedby="batch-current-selection">
        <DialogTitle>{mode === 'delete' ? copy.confirmDelete(ids.length) : label[mode]}</DialogTitle>
        <DialogDescription id="batch-current-selection">{mode === 'delete' ? copy.deleteWarning : copy.selected(ids.length)}</DialogDescription>
        <form className="grid gap-3" onSubmit={e => { e.preventDefault(); void submit(mode) }}>
          {mode === 'move' && <select className="rounded border p-2" required aria-label={copy.moveAssets}
            value={value} onChange={e => setValue(e.target.value)}>
            <option value="">{copy.chooseTarget}</option><CategoryOptions categories={categories} />
          </select>}
          {mode.endsWith('tags') && <label>{copy.tagsHint}<Input autoFocus required value={value} onChange={e => {
            const tags = tagList(e.target.value)
            e.target.setCustomValidity(tags.length ? (validTags(tags) ? '' : copy.invalidTags) : copy.tagRequired)
            setValue(e.target.value)
          }} /></label>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={close}>{copy.cancel}</Button>
            <Button variant={mode === 'delete' ? 'destructive' : 'default'} disabled={busy}>{copy.confirm}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>}
  </>
}
