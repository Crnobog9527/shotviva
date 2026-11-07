'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'

import { useAdminAction } from '../shell/use-admin-action'
import type { AdminCategory, CategoryAdminActions, SaveCategoryPayload } from '../template-categories/types'
import type { ActionResult } from '../templates/types'
import { CategoryDeleteDialog } from './category-delete-dialog'
import { CategoryFormDialog, type CategoryTarget } from './category-form-dialog'
import { moveKey } from './category-form-state'
import { CategoryList } from './category-list'
import { CATEGORIES_COPY as COPY } from './copy'

type Props = { categories: AdminCategory[]; actions: CategoryAdminActions }

const asValue = (result: ActionResult) => (result.ok ? { ok: true as const, value: undefined } : result)

// 分类管理 (ARCHITECTURE §5 「模板分类由后台管理」, T75): list, add, edit, reorder and delete
// template categories. Every save refreshes the page, so the list is what the database holds.
export function CategoriesPanel({ categories: all, actions }: Props) {
  // The built-in templates' categories are managed by code, not here (T75).
  const categories = all.filter((category) => !category.isSystem)
  const [editing, setEditing] = useState<CategoryTarget | null>(null)
  const [deleting, setDeleting] = useState<AdminCategory | null>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const nameOf = (key: string | null) => categories.find((category) => category.key === key)?.nameZh ?? null

  const open = (next: () => void) => {
    clearError()
    next()
  }
  const save = (payload: SaveCategoryPayload, name: string) =>
    run(async () => asValue(await actions.save(payload)), () => {
      setEditing(null)
      return COPY.saved(name)
    })
  const move = (index: number, direction: -1 | 1) => {
    const keys = moveKey(categories.map((category) => category.key), index, direction)
    if (keys) run(async () => asValue(await actions.reorder(keys)), () => COPY.reordered)
  }
  const remove = (category: AdminCategory, moveTo: string | null) =>
    run(() => actions.remove({ key: category.key, moveTo }), ({ moved }) => {
      setDeleting(null)
      return COPY.deleted(category.nameZh, moved, nameOf(moveTo))
    })
  const dialogOpen = editing !== null || deleting !== null

  return (
    <section aria-labelledby="categories-h" className="grid gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-prose gap-1">
          <h2 id="categories-h" className="font-medium">
            {COPY.title}
          </h2>
          <p className="text-sm text-muted-foreground">{COPY.body}</p>
        </div>
        <Button variant="outline" disabled={pending} onClick={() => open(() => setEditing({ mode: 'new' }))}>
          {COPY.add}
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error && !dialogOpen ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <CategoryList
        categories={categories}
        pending={pending}
        onMove={move}
        onEdit={(category) => open(() => setEditing({ mode: 'edit', category }))}
        onDelete={(category) => open(() => setDeleting(category))}
      />
      {editing ? (
        <CategoryFormDialog
          key={editing.mode === 'edit' ? editing.category.key : 'new'}
          target={editing}
          pending={pending}
          error={error}
          onCancel={() => setEditing(null)}
          onSubmit={save}
        />
      ) : null}
      {deleting ? (
        <CategoryDeleteDialog
          key={deleting.key}
          category={deleting}
          categories={categories}
          pending={pending}
          error={error}
          onCancel={() => setDeleting(null)}
          onConfirm={(moveTo) => remove(deleting, moveTo)}
        />
      ) : null}
    </section>
  )
}
