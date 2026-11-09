'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { discountedPriceCents } from '../../codes'
import type { SiteProduct } from '../../config'
import { priceCents } from '../stripe/catalog'
import { usePaymentChannel } from './channel-context'
import { NO_DISCOUNT, usePendingDiscount } from './use-pending-discount'

const Context = createContext(NO_DISCOUNT)
export { refreshDiscount } from './use-pending-discount'

export function DiscountProvider({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const state = usePendingDiscount(active)
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
