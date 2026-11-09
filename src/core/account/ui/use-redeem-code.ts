'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { normalizeCode } from '../../codes'
import { redeemResult, type RedeemResult } from './redeem-result'

type Confirmation = { old: string | null; code: string }

export function useRedeemCode(pendingCode: string | null) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [result, setResult] = useState<RedeemResult | null>(null)
  const [busy, start] = useTransition()

  function submit(replacement?: Confirmation) {
    const code = replacement?.code ?? normalizeCode(input)
    setConfirmation(null)
    if (!code) { setResult({ kind: 'error', key: 'invalid' }); return }
    setResult(null)
    start(async () => {
      try {
        const response = await fetch('/api/codes/redeem', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, context: 'account', replace: Boolean(replacement) }) })
        const outcome = redeemResult(response.ok, await response.json().catch(() => null))
        if (outcome.kind === 'confirm') setConfirmation({ old: outcome.old ?? pendingCode, code })
        else setResult(outcome)
        if (outcome.kind === 'ok') { setInput(''); router.refresh() }
      } catch { setResult({ kind: 'error', key: 'unknown' }) }
    })
  }

  function changeInput(value: string) {
    setInput(value)
    setResult(null)
  }

  return { busy, input, result, confirmation, changeInput, submit, cancel: () => setConfirmation(null) }
}
