'use client'

import { useState } from 'react'

import type { ProviderFloors } from '@/core/templates/provider-pricing'

import { isBulkEditable } from '../templates/bulk-edit-rules'
import type { AdminTemplate, TemplateAdminActions } from '../templates/types'
import { BulkBar } from './bulk-bar'
import { BulkConfirmDialog } from './bulk-confirm-dialog'
import { BulkEditDialog } from './bulk-edit-dialog'
import { BulkFeaturedDialog } from './bulk-featured-dialog'
import { BulkResult } from './bulk-result'
import type { ImageProviderOption } from '../image-provider-field'
import type { CategoryOption } from './category-field'
import { useBulkActive } from './use-bulk-active'
import { useBulkEdit } from './use-bulk-edit'
import { useBulkFeatured } from './use-bulk-featured'

type Props = {
  selected: AdminTemplate[]
  // Another action (switch, save, reorder) is running.
  busy: boolean
  // Bulk 上架 / 下架 (T60), batch edit (T79) and batch 首页精选.
  actions: Pick<TemplateAdminActions, 'setActiveMany' | 'editMany' | 'setFeaturedMany'>
  // The featured list as shown, for the 首页精选 confirm step and the server's stale check.
  featuredIds: string[]
  // The floor the batch edit dialog checks against.
  floor: ProviderFloors
  providers: readonly ImageProviderOption[]
  categories: readonly CategoryOption[]
  onClear: () => void
}

// Bulk 上架 / 下架 (T60): bar → confirm dialog naming the templates → one server call → result list.
// Batch edit (T79) shares the bar: dialog → review → one all-or-nothing call. So does batch
// 首页精选: confirm step with a per-template verdict → one all-or-nothing call.
export function BulkPublish({ selected, busy, actions, featuredIds, floor, providers, categories, onClear }: Props) {
  const [asking, setAsking] = useState<boolean | null>(null)
  const { pending, outcome, error, run, dismiss } = useBulkActive(actions.setActiveMany)
  const edit = useBulkEdit(actions.editMany, onClear)
  const featured = useBulkFeatured(actions.setFeaturedMany, onClear)
  const disabled = busy || pending || edit.pending || featured.pending

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
        onFeature={featured.start}
        onClear={onClear}
      />
      {[error, featured.error].map((message) => message ? (
        <p key={message} role="alert" className="text-destructive text-sm">
          {message}
        </p>
      ) : null)}
      {[edit.done, featured.done].map((message) => message ? (
        <p key={message} role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      ) : null)}
      {outcome ? <BulkResult outcome={outcome} onDismiss={dismiss} /> : null}
      <BulkEditDialog
        providers={providers} edit={edit}
        templates={selected.filter(isBulkEditable)}
        skipped={selected.filter((template) => !isBulkEditable(template))}
        floor={floor}
        categories={categories}
      />
      <BulkFeaturedDialog bulk={featured} selected={selected} featuredIds={featuredIds} />
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
