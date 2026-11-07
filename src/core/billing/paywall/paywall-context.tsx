"use client"

import dynamic from "next/dynamic"
import { useLocale } from "next-intl"
import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { trackPaywallView } from "../../analytics/browser"
import type { EventProps } from "../../analytics/events"
import type { PaymentChannel, SiteProduct } from "../../config"
import { offeredMethods } from "../stripe/catalog"
import { PaymentChannelContext } from "./channel-context"
import { usePaywallState, type PaywallOpenOptions } from "./use-paywall-state"

// The sheet (drawer, dialog, checkout flow) is a chunk of its own: a closed sheet renders nothing,
// so it loads once a provider mounts instead of riding on every page that only has a button that
// could open it (the home generator, signed out, has no provider at all).
const PaywallSheet = dynamic(() => import("./paywall-sheet").then((m) => m.PaywallSheet), { ssr: false })

export type PaywallTrigger = EventProps<"paywall_view">["trigger"]

type PaywallApi = { open(trigger: PaywallTrigger, options?: PaywallOpenOptions): void }

const PaywallContext = createContext<PaywallApi | null>(null)

// One paywall per page tree: the app shell and /pricing mount this, and every entry point
// ("Get credits", the balance chip, a plan on /pricing) opens the same sheet. Products come in
// as props: core never imports the site config. `channel` is the server's PAYMENT_CHANNEL.
type ProviderProps = { products: readonly SiteProduct[]; wishlistLive: boolean; channel: PaymentChannel; children: ReactNode }

export function PaywallProvider({ products, wishlistLive, channel, children }: ProviderProps) {
  const [open, setOpen] = useState(false)
  const [trigger, setTrigger] = useState<PaywallTrigger>("account")
  const state = usePaywallState(offeredMethods(channel, useLocale())[0])
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
    <PaymentChannelContext.Provider value={channel}>
      <PaywallContext.Provider value={api}>
        {children}
        <PaywallSheet open={open} onOpenChange={setOpen} trigger={trigger} products={products} wishlistLive={wishlistLive} state={state} />
      </PaywallContext.Provider>
    </PaymentChannelContext.Provider>
  )
}

export function usePaywall(): PaywallApi {
  const api = useContext(PaywallContext)
  if (!api) throw new Error("usePaywall needs a PaywallProvider")
  return api
}
