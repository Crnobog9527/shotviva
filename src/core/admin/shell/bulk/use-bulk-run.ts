'use client'

import { useState } from 'react'

import type { ActionValue } from '../../templates/types'
import { useAdminAction } from '../use-admin-action'
import type { BulkOutcome } from './bulk-outcome'

// Runs one batch and keeps its per-record outcome for the dialog. On success the ticks shrink to
// the skipped rows (the done ones usually leave the filter when the server action refreshes the
// list), so the admin can look at or retry what was left.
export function useBulkRun<Reason extends string>(keepOnly: (ids: readonly string[]) => void) {
  const { pending, error, run, clearError } = useAdminAction()
  const [outcome, setOutcome] = useState<BulkOutcome<Reason> | null>(null)
  const start = (work: () => Promise<ActionValue<BulkOutcome<Reason>>>) =>
    run(work, (value) => {
      setOutcome(value)
      keepOnly(value.skipped.map((skip) => skip.id))
    })
  const reset = () => {
    setOutcome(null)
    clearError()
  }
  return { pending, error, outcome, start, reset }
}
