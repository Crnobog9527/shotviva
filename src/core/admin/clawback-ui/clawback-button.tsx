'use client'

import { useState } from 'react'

import type { ClawbackPreview, ClawbackResult } from '../orders'
import { Button } from '@/core/ui/button'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { ClawbackDialog } from './clawback-dialog'
import { CLAWBACK_COPY as COPY } from './copy'

export type ClawbackActions = {
  preview: (input: { paymentId: string }) => Promise<ActionValue<ClawbackPreview>>
  apply: (input: { paymentId: string }) => Promise<ActionValue<ClawbackResult>>
}

// On the orders page and a refund ticket (T71). Asks the server what it would take, shows it in
// the confirm dialog, then applies; the server action refreshes the page.
export function ClawbackButton({ paymentId, actions }: { paymentId: string; actions: ClawbackActions }) {
  const [preview, setPreview] = useState<ClawbackPreview | null>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const open = () => run(() => actions.preview({ paymentId }), setPreview)
  const close = () => {
    clearError()
    setPreview(null)
  }
  const apply = () =>
    run(
      () => actions.apply({ paymentId }),
      ({ taken }) => {
        setPreview(null)
        return COPY.done(taken)
      },
    )
  return (
    <span className="grid gap-1">
      <Button type="button" size="sm" variant="outline" onClick={open} disabled={pending}>
        {pending && !preview ? COPY.loading : COPY.button}
      </Button>
      {!preview && error ? <span className="text-xs text-destructive">{error}</span> : null}
      {notice ? <span className="text-xs text-success">{notice}</span> : null}
      {preview ? <ClawbackDialog preview={preview} pending={pending} error={error} onCancel={close} onConfirm={apply} /> : null}
    </span>
  )
}
