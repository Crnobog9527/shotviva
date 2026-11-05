'use client'

import { useState, useTransition } from 'react'

import type { ActionValue } from '../templates/types'

const FALLBACK = '操作失败，请稍后重试'

// Runs one server action at a time and keeps the last outcome as display text. The success
// callback may return a notice to show.
export function useAdminAction() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = <T>(work: () => Promise<ActionValue<T>>, onSuccess: (value: T) => string | void) => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await work().catch(() => ({ ok: false, code: 'INTERNAL', message: FALLBACK }) as const)
      if (result.ok) {
        const message = onSuccess(result.value)
        if (message) setNotice(message)
      } else {
        setError(result.message || FALLBACK)
      }
    })
  }

  return { pending, error, notice, run, clearError: () => setError(null) }
}
