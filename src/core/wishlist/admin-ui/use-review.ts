'use client'

import { useState, useTransition } from 'react'

import type { ReviewInput } from '../schema'
import { COPY } from './copy'
import type { ReviewActions } from './types'

const errorText = (code: string) => (code === 'CONFLICT' || code === 'NOT_FOUND' ? COPY.errors[code] : COPY.errors.generic)

// Runs one review action at a time; the server action revalidates the page, so success
// needs no local state. Errors show the page's own copy for the code, never the server text.
export function useReview(actions: ReviewActions) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (input: ReviewInput, onDone?: () => void) => {
    setError(null)
    startTransition(async () => {
      const result = await actions.review(input)
      if (result.ok) onDone?.()
      else setError(errorText(result.code))
    })
  }
  return { pending, error, run }
}
