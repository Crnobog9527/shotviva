'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Label } from '@/core/ui/label'

import type { AdminCategory } from '../template-categories/types'
import { CATEGORIES_COPY } from './copy'

const COPY = CATEGORIES_COPY.removeDialog
const SELECT = 'border-input h-9 rounded-md border bg-transparent px-3 text-sm'

type Props = {
  category: AdminCategory
  categories: readonly AdminCategory[]
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (moveTo: string | null) => void
}

// Deleting a category (ARCHITECTURE §5): one in use asks where its templates go, published or
// not, and the move and the delete happen in one transaction. The last category cannot go.
// Mounted fresh per category (keyed by the panel).
export function CategoryDeleteDialog({ category, categories, pending, error, onCancel, onConfirm }: Props) {
  const [moveTo, setMoveTo] = useState('')
  const others = categories.filter((other) => other.key !== category.key)
  const inUse = category.templateCount > 0
  const last = others.length === 0
  const ready = !last && (!inUse || moveTo !== '')
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{COPY.title(category.nameZh)}</DialogTitle>
          <DialogDescription>{last ? COPY.last : inUse ? COPY.used(category.templateCount) : COPY.unused}</DialogDescription>
        </DialogHeader>
        {inUse && !last ? (
          <div className="grid gap-1.5">
            <Label htmlFor="cat-move-to">{COPY.moveTo}</Label>
            <select id="cat-move-to" className={SELECT} value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
              <option value="" disabled>
                {COPY.pick}
              </option>
              {others.map((other) => (
                <option key={other.key} value={other.key}>
                  {other.nameZh} · {other.nameEn}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button variant="destructive" disabled={pending || !ready} onClick={() => onConfirm(inUse ? moveTo : null)}>
            {inUse ? COPY.confirmMove : COPY.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
