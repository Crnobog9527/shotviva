'use client'

import { useCallback, useState } from 'react'

import type { TemplateShareItem } from '@/core/template-shares/rules'

export type CreateShareError = 'rate_limited' | 'unavailable' | 'failed'
export type CreateShareState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'done'; url: string }
  | { status: 'error'; error: CreateShareError }

const errorOf = (code: unknown): CreateShareError => (code === 'RATE_LIMITED' ? 'rate_limited' : code === 'NOT_FOUND' ? 'unavailable' : 'failed')

// POST /api/template-shares: one link for the picks, the title and the note.
export function useCreateShare() {
  const [state, setState] = useState<CreateShareState>({ status: 'idle' })
  const create = useCallback(async (items: readonly TemplateShareItem[], title: string, note: string) => {
    setState({ status: 'sending' })
    try {
      const response = await fetch('/api/template-shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, title: title.trim() || undefined, note: note.trim() || undefined }),
      })
      const body: unknown = await response.json().catch(() => null)
      const fields = (body ?? {}) as { url?: unknown; code?: unknown }
      if (response.ok && typeof fields.url === 'string') return setState({ status: 'done', url: fields.url })
      setState({ status: 'error', error: errorOf(fields.code) })
    } catch {
      setState({ status: 'error', error: 'failed' })
    }
  }, [])
  const reset = useCallback(() => setState({ status: 'idle' }), [])
  return { state, create, reset }
}
