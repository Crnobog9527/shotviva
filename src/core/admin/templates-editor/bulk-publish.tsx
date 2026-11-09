'use client'

import { useState } from 'react'

import type { ProviderFloors } from '@/core/templates/provider-pricing'

import { isBulkEditable } from '../templates/bulk-edit-rules'
import type { AdminTemplate, TemplateAdminActions } from '../templates/types'
import { BulkBar } from './bulk-bar'
import { BulkConfirmDialog } from './bulk-confirm-dialog'
import { BulkEditDialog } from './bulk-edit-dialog'
import { BulkResult } from './bulk-result'
import type { CategoryOption } from './category-field'
import { useBulkActive } from './use-bulk-active'
import { useBulkEdit } from './use-bulk-edit'

type Props = {
  selected: AdminTemplate[]
  // Another action (switch, save, reorder) is running.
  busy: boolean
  setActiveMany: TemplateAdminActions['setActiveMany']
  // Batch edit (T79) and the floor its dialog checks against.
  editMany: TemplateAdminActions['editMany']
  floor: ProviderFloors
  categories: readonly CategoryOption[]
  onClear: () => void
}

// Bulk 上架 / 下架 (T60): bar → confirm dialog naming the templates → one server call → result list.
// Batch edit (T79) shares the bar: dialog → review → one all-or-nothing call.
export function BulkPublish({ selected, busy, setActiveMany, editMany, floor, categories, onClear }: Props) {
  const [asking, setAsking] = useState<boolean | null>(null)
  const { pending, outcome, error, run, dismiss } = useBulkActive(setActiveMany)
  const edit = useBulkEdit(editMany, onClear)
  const disabled = busy || pending || edit.pending

  const confirm = (reason: string | undefined) => {
    const active = asking
    if (active === null) return
    setAsking(null)
    run({ ids: selected.map((template) => template.id), active, ...(reason ? { reason } : {}) }, onClear)
  }

  return (
    <>
      <BulkBar
        count={selected.length}
        pending={disabled}
        onPublish={() => setAsking(true)}
        onUnpublish={() => setAsking(false)}
        onEdit={edit.start}
        onClear={onClear}
      />
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {edit.done ? (
        <p role="status" className="text-sm text-emerald-700">
          {edit.done}
        </p>
      ) : null}
      {outcome ? <BulkResult outcome={outcome} onDismiss={dismiss} /> : null}
      <BulkEditDialog
        edit={edit}
        templates={selected.filter(isBulkEditable)}
        skipped={selected.filter((template) => !isBulkEditable(template))}
        floor={floor}
        categories={categories}
      />
      <BulkConfirmDialog
        active={asking}
        templates={selected}
        pending={disabled}
        onCancel={() => setAsking(null)}
        onConfirm={confirm}
      />
    </>
  )
}
