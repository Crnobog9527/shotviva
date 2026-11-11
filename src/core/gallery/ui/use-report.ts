'use client'

import { useState } from 'react'

import type { ReportReason } from '../../moderation/reasons'

export type ReportText = {
  open: string
  title: string
  body: string
  reasonLabel: string
  reasons: Record<ReportReason, string>
  noteLabel: string
  submit: string
  cancel: string
  sending: string
  done: string
  duplicate: string
  limited: string
  failed: string
}

export type ReportState = 'idle' | 'sending' | 'done' | 'duplicate' | 'limited' | 'failed'

const OUTCOMES = { reported: 'done', duplicate: 'duplicate', limited: 'limited' } as const

// POST /api/gallery/report. Signed out (401) goes to log in and comes back to this page.
export function useReport(jobId: string, loginHref: string) {
  const [state, setState] = useState<ReportState>('idle')
  const send = async (reason: ReportReason, note: string) => {
    setState('sending')
    try {
      const response = await fetch('/api/gallery/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, reason, ...(note.trim() ? { note: note.trim() } : {}) }),
      })
      if (response.status === 401) {
        window.location.assign(loginHref)
        return
      }
      const body: unknown = await response.json().catch(() => null)
      const outcome = (body as { outcome?: keyof typeof OUTCOMES } | null)?.outcome
      setState(response.ok && outcome && outcome in OUTCOMES ? OUTCOMES[outcome] : 'failed')
    } catch {
      setState('failed')
    }
  }
  return { state, send }
}
