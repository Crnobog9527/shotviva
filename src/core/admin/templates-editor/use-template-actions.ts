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

  const run = (work: () => Promise<ActionResult>, success: string, onSuccess?: () => void) => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      if (settle(await callAction(work), success)) onSuccess?.()
    })
  }

  // For a caller that runs its own transition (the sortable lists' optimistic order): the
  // same banner, and a promise that settles once the outcome is shown.
  const report = async (work: () => Promise<ActionResult>, success: string, failurePrefix?: string) => {
    setError(null)
    setNotice(null)
    settle(await callAction(work), success, failurePrefix)
  }

  return { pending, error, notice, run, report, clearError: () => setError(null) }
}
