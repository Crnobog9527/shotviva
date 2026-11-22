'use client'

import { useState, useTransition } from 'react'

import type { CreateShareAction, CreateShareRequest } from './share-types'

export type CreateState = { kind: 'form' } | { kind: 'ready'; url: string } | { kind: 'failed'; reason: 'gone' | 'limit' | 'busy' | 'error' }

// The dialog's one request: create the link, then hold its full address (this site's own origin,
// so a link made on the test site opens there).
export function useCreateShare(create: CreateShareAction) {
  const [state, setState] = useState<CreateState>({ kind: 'form' })
  const [pending, startTransition] = useTransition()
  const submit = (request: CreateShareRequest) =>
    startTransition(async () => {
      try {
        const result = await create(request)
        setState('path' in result ? { kind: 'ready', url: new URL(result.path, window.location.origin).href } : { kind: 'failed', reason: result.failed })
      } catch {
        setState({ kind: 'failed', reason: 'error' })
      }
    })
  return { state, pending, submit, reset: () => setState({ kind: 'form' }) }
}
