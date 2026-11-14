'use client'

import { useEffect, useState } from 'react'

import type { PendingDiscount } from '../../codes'

type DiscountState = { buyer: boolean; guestCode: boolean; pending: PendingDiscount | null }
export const NO_DISCOUNT: DiscountState = { buyer: false, guestCode: false, pending: null }
const RELOAD = 'shotviva:discount-changed'

export function refreshDiscount() {
  window.dispatchEvent(new Event(RELOAD))
}

// Pricing prerenders public catalogue prices. The sheet reads the private offer only when
// opened; a successful redemption refreshes both surfaces, including the page behind it.
export function usePendingDiscount(active: boolean) {
  const [state, setState] = useState(NO_DISCOUNT)
  useEffect(() => {
    if (!active) return
    let controller: AbortController
    const load = async () => {
      controller?.abort()
      const request = new AbortController()
      controller = request
      try {
        const response = await fetch('/api/codes/pending', { cache: 'no-store', signal: request.signal })
        const data: DiscountState = response.ok ? await response.json() : NO_DISCOUNT
        if (!request.signal.aborted) setState(data)
      } catch {
        if (!request.signal.aborted) setState(NO_DISCOUNT)
      }
    }
    void load()
    const visible = () => { if (!document.hidden) void load() }
    window.addEventListener(RELOAD, load)
    document.addEventListener('visibilitychange', visible)
    return () => {
      controller.abort()
      window.removeEventListener(RELOAD, load)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [active])
  const expiresAt = state.pending?.expiresAt
  useEffect(() => {
    if (!expiresAt || !active) return
    let timer: number
    const schedule = () => {
      const remaining = Date.parse(expiresAt) - Date.now()
      if (remaining <= 0) {
        setState(previous => ({ ...previous, pending: null }))
      } else timer = window.setTimeout(schedule, Math.min(2_147_483_647, remaining))
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [expiresAt, active])
  return state
}
