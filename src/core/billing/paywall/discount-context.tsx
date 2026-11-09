'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { discountedPriceCents, type PendingDiscount } from '../../codes'
import type { SiteProduct } from '../../config'
import { priceCents } from '../stripe/catalog'
import { usePaymentChannel } from './channel-context'

type DiscountState = { buyer: boolean; guestCode: boolean; pending: PendingDiscount | null }
const EMPTY: DiscountState = { buyer: false, guestCode: false, pending: null }
const Context = createContext(EMPTY)
const RELOAD = 'shotviva:discount-changed'

export function refreshDiscount() {
  window.dispatchEvent(new Event(RELOAD))
}

// Pricing prerenders public catalogue prices. The sheet reads the private offer only when
// opened; a successful redemption refreshes both surfaces, including the page behind it.
export function DiscountProvider({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const [state, setState] = useState(EMPTY)
  useEffect(() => {
    if (!active) return
    let controller: AbortController
    const load = async () => {
      controller?.abort()
      const request = new AbortController()
      controller = request
      try {
        const response = await fetch('/api/codes/pending', { cache: 'no-store', signal: request.signal })
        const data: DiscountState = response.ok ? await response.json() : EMPTY
        if (!request.signal.aborted) setState(data)
      } catch {
        if (!request.signal.aborted) setState(EMPTY)
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
        refreshDiscount()
      } else timer = window.setTimeout(schedule, Math.min(2_147_483_647, remaining))
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [expiresAt, active])
  return <Context.Provider value={state}>{children}</Context.Provider>
}

export function useDiscount() {
  return useContext(Context)
}

export function useProductDiscount(product: SiteProduct) {
  const { pending } = useDiscount()
  const channel = usePaymentChannel()
  if (channel !== 'stripe' || !pending?.products.includes(product.id)) return null
  const cents = priceCents(product)
  return { offer: pending, priceUsd: discountedPriceCents(cents, pending.percent) / 100 }
}

export function discountTerm(duration: PendingDiscount['duration'], singlePayment: boolean, period: 'month' | 'year') {
  if (singlePayment) return 'codeOnce'
  if (duration === 'once') return period === 'month' ? 'codeFirstMonth' : 'codeFirstYear'
  return duration === 'repeating' ? 'codeMonths' : 'codeEvery'
}
