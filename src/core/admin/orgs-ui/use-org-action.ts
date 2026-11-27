'use client'

import { useState, useTransition } from 'react'

import { ORGS_COPY } from '../orgs/copy'
import type { OrgActionResult } from '../orgs/types'

// One server action at a time; keeps the last outcome as a message. A throw (network drop) shows
// the generic failure so the form never looks stuck.
export function useOrgAction() {
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null)

  const run = <T,>(work: () => Promise<OrgActionResult<T>>, onSuccess?: (result: Extract<OrgActionResult<T>, { ok: true }>) => void) => {
    setOutcome(null)
    startTransition(async () => {
      const result = await work().catch((): OrgActionResult<T> => ({ ok: false, message: ORGS_COPY.failed }))
      setOutcome({ ok: result.ok, message: result.message })
      if (result.ok) onSuccess?.(result)
    })
  }
  return { pending, outcome, run }
}
