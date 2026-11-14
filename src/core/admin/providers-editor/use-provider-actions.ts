'use client'

import { useState, useTransition } from 'react'

import type { ProviderActionResult } from '../providers/types'

import { PROVIDERS_COPY } from './copy'

// Runs one server action at a time and keeps the last outcome as display text.
export function useProviderActions() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = <T>(work: () => Promise<ProviderActionResult<T>>, onSuccess: (value: T) => string | void) => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await work()
      if (result.ok) {
        const message = onSuccess(result.value)
        if (message) setNotice(message)
      } else {
        setError(PROVIDERS_COPY.errors[result.reason])
      }
    })
  }

  return { pending, error, notice, run, clearError: () => setError(null) }
}
