'use client'

import { useState } from 'react'

import type { AdminTemplate, TemplateAdminActions } from '../templates/types'
import { BulkBar } from './bulk-bar'
import { BulkConfirmDialog } from './bulk-confirm-dialog'
import { BulkResult } from './bulk-result'
import { useBulkActive } from './use-bulk-active'

type Props = {
  selected: AdminTemplate[]
  // Another action (switch, save, reorder) is running.
  busy: boolean
  setActiveMany: TemplateAdminActions['setActiveMany']
  onClear: () => void
}

// Bulk 上架 / 下架 (T60): bar → confirm dialog naming the templates → one server call → result list.
export function BulkPublish({ selected, busy, setActiveMany, onClear }: Props) {
  const [asking, setAsking] = useState<boolean | null>(null)
  const { pending, outcome, error, run, dismiss } = useBulkActive(setActiveMany)
  const disabled = busy || pending

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
        onClear={onClear}
      />
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {outcome ? <BulkResult outcome={outcome} onDismiss={dismiss} /> : null}
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
