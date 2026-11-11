'use client'

import { useEffect, useRef, useState } from 'react'

import { usePaywall } from '@/core/billing/paywall/provider'

import { requestZip, stateAfter, type ZipState } from './zip-download'

// One batch's Download ZIP: asks the route once, and on ready sends the browser to the signed
// link it returned to save the file. A 202 means the archive is still being packed by an earlier request, so it asks again
// after Retry-After on its own; after a 429 the button rests until Retry-After has passed.
// Below Pro it opens the paywall on the tier the server named.
export function useZipDownload(batchId: string) {
  const [state, setState] = useState<ZipState>({ kind: 'idle' })
  const paywall = usePaywall()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const ask = async () => {
    setState({ kind: 'packing' })
    const outcome = await requestZip(batchId)
    if (!alive.current) return
    if (outcome.kind === 'upgrade') paywall.open('tier_required', { step: 'period', tier: outcome.tier })
    if (outcome.kind === 'ready') window.location.assign(outcome.url)
    if (outcome.kind === 'packing') timer.current = setTimeout(() => void ask(), outcome.retryAfterMs)
    // After the wait the button is live again; the line stays until the next try.
    if (outcome.kind === 'limited') timer.current = setTimeout(() => setState({ kind: 'idle' }), outcome.retryAfterMs)
    setState(stateAfter(outcome))
  }

  const start = () => {
    if (state.kind === 'packing' || state.kind === 'limited') return
    void ask()
  }

  return { state, start }
}
