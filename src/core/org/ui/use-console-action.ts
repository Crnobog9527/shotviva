'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import type { ConsoleResult } from '../console/types'

export type Outcome = { ok: boolean; text: string } | null

// One server action at a time per form. A failed result shows the reason in words
// (app.org.errors.*); a throw (network drop, expired session) shows the generic one, so a form
// never looks stuck. The caller keeps its request id until `onOk` runs, so a retry is the same
// request and the database applies it once.
export function useConsoleAction() {
  const t = useTranslations('app.org')
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<Outcome>(null)

  function run<T extends object>(work: () => Promise<ConsoleResult<T>>, success: string, onOk?: (result: Extract<ConsoleResult<T>, { ok: true }>) => void) {
    setOutcome(null)
    startTransition(async () => {
      const result = await work().catch((): ConsoleResult<T> => ({ ok: false, error: 'FAILED' }))
      if (result.ok) {
        setOutcome({ ok: true, text: success })
        onOk?.(result)
      } else {
        setOutcome({ ok: false, text: t(`errors.${result.error}`) })
      }
    })
  }
  return { pending, outcome, run, clear: () => setOutcome(null) }
}
