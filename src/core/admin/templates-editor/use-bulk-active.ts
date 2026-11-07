'use client'

import { useState, useTransition } from 'react'

import type { ActiveChangeOutcome } from '../templates/publish-rules'
import type { TemplateAdminActions } from '../templates/types'

type Request = { ids: string[]; active: boolean; reason?: string }

// One bulk call at a time; keeps the last per-template outcome for the result list.
export function useBulkActive(setActiveMany: TemplateAdminActions['setActiveMany']) {
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<ActiveChangeOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (request: Request, onDone: () => void) => {
    setError(null)
    setOutcome(null)
    startTransition(async () => {
      const result = await setActiveMany(request)
      if (result.ok) {
        setOutcome(result.value)
        onDone()
      } else {
        setError(result.message)
      }
    })
  }

  return { pending, outcome, error, run, dismiss: () => setOutcome(null) }
}
