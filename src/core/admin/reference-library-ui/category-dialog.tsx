import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/core/ui/dialog'
import { Button } from '@/core/ui/button'
import { CATEGORY_LIMITS } from '@/core/templates/categories'
import { Input } from '@/core/ui/input'
import { copy } from './copy'
import { CategoryOptions } from './category-options'
import type { CategoryInput, ReferenceCategory } from './types'

export type CategoryDialogState = { mode: 'create' | 'rename' | 'delete'; node?: ReferenceCategory }
type Props = {
  state: CategoryDialogState
  categories: ReferenceCategory[]
  onSave(value: CategoryInput): Promise<boolean>
  busy: boolean
  error: string
  onClose(): void
}

export function CategoryDialog({ state, categories, onSave, busy, error, onClose }: Props) {
  const editing = state.mode === 'rename'
  const deleting = state.mode === 'delete'
  const initial = editing ? state.node : undefined
  const [zh, setZh] = useState(initial?.nameZh ?? '')
  const [en, setEn] = useState(initial?.nameEn ?? '')
  const [target, setTarget] = useState('')
  const title = dialogTitle(state)
  async function submit() {
    const payload = categoryPayload(state, zh, en, target)
    if (await onSave(payload)) onClose()
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent aria-describedby={undefined}>
      <DialogTitle>{title}</DialogTitle>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit() }}>
        {deleting ? <label className="grid gap-1">{copy.moveAssets}
          <select className="rounded border p-2" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">{copy.emptyCategory}</option>
            <CategoryOptions categories={categories.filter(item => item.key !== state.node?.key)} />
          </select>
        </label> : <>
          <p className="text-xs text-muted-foreground">{copy.nameHint}</p>
          <label className="grid gap-1">{copy.nameZh}<Input autoFocus required maxLength={CATEGORY_LIMITS.nameZh} value={zh} onChange={e => { e.target.setCustomValidity(e.target.value.trim() ? '' : copy.nameRequired); setZh(e.target.value) }} /></label>
          <label className="grid gap-1">{copy.nameEn}<Input required maxLength={CATEGORY_LIMITS.nameEn} value={en} onChange={e => { e.target.setCustomValidity(e.target.value.trim() ? '' : copy.nameRequired); setEn(e.target.value) }} /></label>
        </>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{copy.cancel}</Button>
          <Button variant={deleting ? 'destructive' : 'default'} disabled={busy}>{deleting ? copy.removeCategory : copy.save}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

function dialogTitle({ mode, node }: CategoryDialogState) {
  if (mode === 'delete') return copy.removeNamed(node?.nameZh ?? '')
  if (mode === 'rename') return copy.rename
  return node ? copy.addBelow(node.nameZh) : copy.root
}

function categoryPayload(state: CategoryDialogState, zh: string, en: string, target: string): CategoryInput {
  const names = { nameZh: zh.trim(), nameEn: en.trim() }
  if (state.mode === 'delete' && state.node) return { op: 'delete', key: state.node.key, moveTo: target || null }
  if (state.mode === 'rename' && state.node) return { op: 'rename', key: state.node.key, parentId: state.node.parentId, ...names }
  return { op: 'create', parentId: state.node?.key ?? null, ...names }
}
