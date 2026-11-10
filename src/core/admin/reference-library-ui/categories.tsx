import { useState } from 'react'
import { CategoryTree } from '@/core/admin/ui/category-tree'
import { Button } from '@/core/ui/button'
import { CategoryDialog, type CategoryDialogState } from './category-dialog'
import { errorMessage, changeCategory } from './api'
import { copy } from './copy'
import type { CategoryInput, ReferenceCategory } from './types'

type Props = {
  categories: ReferenceCategory[]
  selected: string | null
  onSelect(key: string | null): void
  onChange(): void
}
export function Categories({ categories, selected, onSelect, onChange }: Props) {
  const [dialog, setDialog] = useState<CategoryDialogState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function open(next: CategoryDialogState) { setError(''); setDialog(next) }
  async function save(input: CategoryInput) {
    setError('')
    setBusy(true)
    try {
      await changeCategory(input)
      if (input.op === 'delete' && input.key === selected) onSelect(null)
      onChange()
      return true
    } catch (error) { setError(errorMessage(error)); return false }
    finally { setBusy(false) }
  }
  return <aside className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{copy.categories}</h2>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => open({ mode: 'create' })}>{copy.root}</Button>
    </div>
    <Button variant={!selected ? 'secondary' : 'ghost'} aria-pressed={!selected} onClick={() => onSelect(null)}>{copy.all}</Button>
    <CategoryTree nodes={categories} labelOf={node => node.nameZh} onMove={move => void save({ op: 'move', ...move })} disabled={busy}
      renderRow={node => <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <Button variant={selected === node.key ? 'secondary' : 'ghost'} size="sm" aria-pressed={selected === node.key} onClick={() => onSelect(node.key)}>{node.nameZh}</Button>
        {node.level < 3 && <Button size="xs" variant="outline" disabled={busy} onClick={() => open({ mode: 'create', node })}>{copy.child}</Button>}
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => open({ mode: 'rename', node })}>{copy.rename}</Button>
        <Button size="xs" variant="ghost" disabled={busy || categories.some(item => item.parentId === node.key)} onClick={() => open({ mode: 'delete', node })}>{copy.removeCategory}</Button>
      </div>} />
    {!categories.length && <p className="text-sm text-muted-foreground">{copy.categoryEmpty}</p>}
    {!dialog && error && <p role="alert" className="text-destructive">{error}</p>}
    {dialog && <CategoryDialog state={dialog} categories={categories} busy={busy} error={error} onSave={save} onClose={() => setDialog(null)} />}
  </aside>
}
