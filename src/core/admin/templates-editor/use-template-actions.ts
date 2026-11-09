'use client'

import { useState, useTransition } from 'react'

import type { ActionResult } from '../templates/types'
import { orderCopy } from './copy'

// A server action that never reaches the server (offline, connection dropped) rejects instead
// of returning a result; the editor treats that like any other refusal.
async function callAction(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work()
  } catch {
    return { ok: false, code: 'NETWORK', message: orderCopy.offline }
  }
}

// Runs one server action at a time and keeps the last outcome for the banner / dialog.
export function useTemplateActions() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const settle = (result: ActionResult, success: string, failurePrefix = '') => {
    if (result.ok) setNotice(success)
    else setError(`${failurePrefix}${result.message}`)
    return result.ok
  }

  // Every save goes through this one transition, so `pending` is true while any of them runs
  // and the switches, 移出 and the bulk bar wait for it. The promise settles once the outcome
  // is shown, for a caller that also keeps its own transition open (the sortable lists'
  // optimistic order, T76).
  const run = (work: () => Promise<ActionResult>, success: string, onSuccess?: (result: Extract<ActionResult, { ok: true }>) => void, failurePrefix?: string) =>
    new Promise<void>((resolve) => {
      setError(null)
      setNotice(null)
      startTransition(async () => {
        const result = await callAction(work)
        settle(result, success, failurePrefix)
        if (result.ok) onSuccess?.(result)
        resolve()
      })
    })

  return { pending, error, notice, run, clearError: () => setError(null) }
}
