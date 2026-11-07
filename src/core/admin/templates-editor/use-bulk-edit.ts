'use client'

import { useState, useTransition } from 'react'

import type { BulkEditFailure, BulkEditPatch } from '../templates/bulk-edit-rules'
import type { ActionValue, TemplateAdminActions } from '../templates/types'
import { emptyBulkEdit, type BulkEditValues } from './bulk-edit-state'
import { bulkEditCopy, orderCopy } from './copy'

type Outcome = ActionValue<{ changed: number; failures: BulkEditFailure[] }>

// The batch-edit dialog's state (T79): form → review → one server call. A refusal keeps the
// dialog open on the review step with the server's list of failing templates.
export function useBulkEdit(editMany: TemplateAdminActions['editMany'], onSaved: () => void) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [values, setValues] = useState<BulkEditValues>(emptyBulkEdit)
  const [failures, setFailures] = useState<BulkEditFailure[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const start = () => {
    setValues(emptyBulkEdit())
    setStep('form')
    setFailures(null)
    setError(null)
    setDone(null)
    setOpen(true)
  }

  const save = (ids: string[], patch: BulkEditPatch) =>
    startTransition(async () => {
      setError(null)
      let result: Outcome
      try {
        result = await editMany({ ids, patch })
      } catch {
        result = { ok: false, code: 'NETWORK', message: orderCopy.offline }
      }
      if (!result.ok) return setError(result.message)
      if (result.value.failures.length > 0) return setFailures(result.value.failures)
      setDone(bulkEditCopy.done(result.value.changed))
      setOpen(false)
      onSaved()
    })

  return {
    open,
    step,
    values,
    failures,
    error,
    done,
    pending,
    start,
    close: () => setOpen(false),
    setValues: (next: BulkEditValues) => {
      setValues(next)
      setFailures(null)
    },
    review: () => setStep('review'),
    back: () => {
      setStep('form')
      setFailures(null)
      setError(null)
    },
    save,
  }
}

export type BulkEditState = ReturnType<typeof useBulkEdit>
