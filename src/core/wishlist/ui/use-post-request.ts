'use client'

import { useState } from 'react'

import { errorCode } from './api-error'

export type PostError = 'FORBIDDEN' | 'RATE_LIMITED' | 'INVALID_INPUT' | 'generic'

const KNOWN: ReadonlySet<string> = new Set(['FORBIDDEN', 'RATE_LIMITED', 'INVALID_INPUT'])

// Sends the description and the uploaded input keys; the server re-encodes the photos into
// requests/ and stores the request as pending (ARCHITECTURE §15.1).
export function usePostRequest(onSent: () => void) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<PostError | null>(null)

  const send = async (description: string, inputKeys: string[]) => {
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/wishlist/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, input_keys: inputKeys }),
      })
      if (response.ok) return onSent()
      const code = await errorCode(response)
      setError(code && KNOWN.has(code) ? (code as PostError) : 'generic')
    } catch {
      setError('generic')
    }
    setSending(false)
  }
  return { sending, error, send }
}
