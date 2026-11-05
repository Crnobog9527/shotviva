'use client'

import { useState } from 'react'

import type { VoteResult } from '../types'
import { errorCode } from './api-error'

export type VoteError = 'CONFLICT' | 'FORBIDDEN' | 'generic'

const KNOWN: ReadonlySet<string> = new Set(['CONFLICT', 'FORBIDDEN'])

// "I want this too": the count the server returns is the truth (Max votes weigh 3), so the
// button waits for it rather than guessing; a second tap takes the vote back.
export function useVote(requestId: string, onResult: (result: VoteResult) => void) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<VoteError | null>(null)

  const toggle = async () => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/wishlist/requests/${requestId}/vote`, { method: 'POST' })
      if (response.ok) {
        onResult((await response.json()) as VoteResult)
      } else {
        const code = await errorCode(response)
        setError(code && KNOWN.has(code) ? (code as VoteError) : 'generic')
      }
    } catch {
      setError('generic')
    } finally {
      setPending(false)
    }
  }
  return { pending, error, toggle }
}
