'use client'

import { useState } from 'react'

import type { DishwareItem } from '@/core/dishware/types'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { CategorySelect } from './category-select'
import { dishwareCopy as copy } from './copy'
import type { DishwareActions, ShownDishware } from './types'
import { useDishwareWrite } from './use-dishware-save'

const inputOf = (item: DishwareItem) => ({
  id: item.id, label: item.label, category: item.category, shape: item.shape,
  imageKey: item.imageKey, width: item.width, height: item.height, isActive: item.isActive,
})

// One vessel: its picture and the four things an admin changes.
export function DishwareCard({ item, actions }: { item: ShownDishware; actions: Pick<DishwareActions, 'save' | 'remove'> }) {
  const [draft, setDraft] = useState(() => inputOf(item))
  const write = useDishwareWrite()
  const remove = () => {
    if (window.confirm(copy.confirmRemove)) write.run(() => actions.remove(item.id))
  }
  return (
    <li className={`grid gap-2 rounded-lg border p-3 ${draft.isActive ? '' : 'opacity-60'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed private URL, admin only */}
      <img src={item.previewUrl} alt={item.label} width={item.width} height={item.height} className="aspect-[4/3] w-full rounded-md bg-muted object-contain" />
      <Input aria-label={copy.label} value={draft.label} maxLength={40} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      <CategorySelect id={`category-${item.id}`} value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
      <textarea aria-label={copy.shape} className="min-h-20 rounded-md border bg-background p-2 text-sm" maxLength={200}
        value={draft.shape} onChange={(event) => setDraft({ ...draft, shape: event.target.value })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
        {draft.isActive ? copy.active : copy.inactive}
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={write.pending} onClick={() => write.run(() => actions.save(draft))}>{write.pending ? copy.saving : copy.save}</Button>
        <Button size="sm" variant="outline" disabled={write.pending} onClick={remove}>{copy.remove}</Button>
        {write.done && <span className="text-xs text-muted-foreground">{copy.saved}</span>}
      </div>
      {write.error && <p role="alert" className="text-xs text-destructive">{write.error}</p>}
    </li>
  )
}
