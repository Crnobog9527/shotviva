'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { pricingV2 } from '../../public-env'
import { discountedPriceCents } from '../../codes/discount'
import type { SiteProduct } from '../../config'
import { bestPackOffer } from '../pack-price'
import { useStanding } from './standing-context'
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

// One quote for the pack card, its accessible button and the checkout footer. The current
// tier comes from the server. Pending Stripe codes stay unspent when they conflict.
export function useProductQuote(product: SiteProduct) {
  const discount = useProductDiscount(product)
  const { tier } = useStanding()
  const { cents, useCode } = bestPackOffer(product, pricingV2 ? tier : null, discount?.offer.percent ?? null)
  const member = !useCode && cents < priceCents(product)
  return { cents, priceUsd: cents / 100, member, keptCode: member && discount !== null, discount: useCode ? discount : null }
}
