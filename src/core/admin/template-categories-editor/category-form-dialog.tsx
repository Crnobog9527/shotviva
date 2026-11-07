'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { AdminCategory, SaveCategoryPayload } from '../template-categories/types'
import { CategoryFormFields } from './category-form-fields'
import { buildCategoryPayload, emptyCategoryValues, patchCategoryValues, toCategoryValues } from './category-form-state'
import { CATEGORIES_COPY } from './copy'

const COPY = CATEGORIES_COPY.form

export type CategoryTarget = { mode: 'new' } | { mode: 'edit'; category: AdminCategory }

type Props = {
  target: CategoryTarget
  pending: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (payload: SaveCategoryPayload, name: string) => void
}

// Create or edit one category. Mounted fresh per target (keyed by the panel).
export function CategoryFormDialog({ target, pending, error, onCancel, onSubmit }: Props) {
  const isNew = target.mode === 'new'
  const [values, setValues] = useState(() => (target.mode === 'edit' ? toCategoryValues(target.category) : emptyCategoryValues()))
  const [invalid, setInvalid] = useState(false)
  const submit = () => {
    const payload = buildCategoryPayload(values, isNew)
    setInvalid(payload === null)
    if (payload) onSubmit(payload, values.nameZh.trim())
  }
  const shownError = invalid ? COPY.invalid : error
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? COPY.newTitle : COPY.editTitle(target.category.nameZh)}</DialogTitle>
        </DialogHeader>
        <CategoryFormFields values={values} isNew={isNew} onChange={(patch) => setValues((prev) => patchCategoryValues(prev, patch, isNew))} />
        {shownError ? (
          <p role="alert" className="text-sm text-destructive">
            {shownError}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? COPY.saving : COPY.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
