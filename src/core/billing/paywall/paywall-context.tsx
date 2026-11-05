"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { trackPaywallView } from "../../analytics/browser"
import type { EventProps } from "../../analytics/events"
import type { SiteProduct } from "../../config"
import { PaywallSheet } from "./paywall-sheet"
import { usePaywallState, type PaywallOpenOptions } from "./use-paywall-state"

export type PaywallTrigger = EventProps<"paywall_view">["trigger"]

type PaywallApi = { open(trigger: PaywallTrigger, options?: PaywallOpenOptions): void }

const PaywallContext = createContext<PaywallApi | null>(null)

// One paywall per page tree: the app shell and /pricing mount this, and every entry point
// ("Get credits", the balance chip, a plan on /pricing) opens the same sheet. Products come in
// as props: core never imports the site config.
export function PaywallProvider({ products, wishlistLive, children }: { products: readonly SiteProduct[]; wishlistLive: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [trigger, setTrigger] = useState<PaywallTrigger>("account")
  const state = usePaywallState()
  const { reset } = state
  const api = useMemo<PaywallApi>(
    () => ({
      open(next, options) {
        reset(options)
        setTrigger(next)
        setOpen(true)
        trackPaywallView(next)
      },
    }),
    [reset],
  )
  return (
    <PaywallContext.Provider value={api}>
      {children}
      <PaywallSheet open={open} onOpenChange={setOpen} trigger={trigger} products={products} wishlistLive={wishlistLive} state={state} />
    </PaywallContext.Provider>
  )
}

export function usePaywall(): PaywallApi {
  const api = useContext(PaywallContext)
  if (!api) throw new Error("usePaywall needs a PaywallProvider")
  return api
}
