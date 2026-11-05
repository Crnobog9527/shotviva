'use client'

import { useState, useTransition } from 'react'

import type { ActionResult } from '../templates/types'

// Runs one server action at a time and keeps the last outcome for the banner / dialog.
export function useTemplateActions() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = (work: () => Promise<ActionResult>, success: string, onSuccess?: () => void) => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await work()
      if (result.ok) {
        setNotice(success)
        onSuccess?.()
      } else {
        setError(result.message)
      }
    })
  }

  return { pending, error, notice, run, clearError: () => setError(null) }
}
