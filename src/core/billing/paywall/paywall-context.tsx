"use client"

import dynamic from "next/dynamic"
import { useLocale } from "next-intl"
import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { trackPaywallView } from "../../analytics/browser"
import { useUpdateHold } from "../../app-update/holds"
import type { EventProps } from "../../analytics/events"
import type { MembershipTier, PaymentChannel, SiteProduct } from "../../config"
import { offeredMethods } from "../stripe/catalog"
import { holdsMembership, NO_STANDING, type MemberStanding } from "../subscription/standing"
import { PaymentChannelContext, WechatPayContext } from "./channel-context"
import { PerkFactsContext, type PerkFacts } from "./perk-facts"
import { StandingContext } from "./standing-context"
import { usePaywallState, type PaywallMoment, type PaywallOpenOptions } from "./use-paywall-state"

// The sheet (drawer, dialog, checkout flow) is a chunk of its own: a closed sheet renders nothing,
// so it loads once a provider mounts instead of riding on every page that only has a button that
// could open it (the home generator, signed out, has no provider at all).
const PaywallSheet = dynamic(() => import("./paywall-sheet").then((m) => m.PaywallSheet), { ssr: false })

export type PaywallTrigger = EventProps<"paywall_view">["trigger"]

type PaywallApi = { open(trigger: PaywallTrigger, options?: PaywallOpenOptions): void }

const PaywallContext = createContext<PaywallApi | null>(null)

// One paywall per page tree: the app shell and /pricing mount this, and every entry point
// ("Get credits", the balance chip, a plan on /pricing) opens the same sheet. Products come in
// as props: core never imports the site config. `channel` is the server's PAYMENT_CHANNEL and
// `wechatPay` its STRIPE_WECHAT_PAY (T73).
// It also holds what the buyer already has (T66, fed by StandingSlot), so a member opens on a
// plan they can actually buy; the rule that decides it is fetched only for members.
// `perkFacts`: the wishlist switch and the live Standard prices the plan cards read (perk-facts).
type ProviderProps = { products: readonly SiteProduct[]; perkFacts: PerkFacts; channel: PaymentChannel; wechatPay: boolean; children: ReactNode }

export function PaywallProvider({ products, perkFacts, channel, wechatPay, children }: ProviderProps) {
  const [open, setOpen] = useState(false)
  // The paywall is the start of a checkout: the new-version banner waits until it closes (T90).
  useUpdateHold("checkout", open)
  const [trigger, setTrigger] = useState<PaywallTrigger>("account")
  const [moment, setMoment] = useState<{ moment?: PaywallMoment; needed?: number; tier?: MembershipTier }>({})
  const [standing, setStanding] = useState<MemberStanding>(NO_STANDING)
  const state = usePaywallState(offeredMethods(channel, useLocale())[0])
  const { reset } = state
  const api = useMemo<PaywallApi>(
    () => ({
      open(next, options) {
        const show = (picked?: PaywallOpenOptions) => {
          reset(picked)
          setTrigger(next)
          setMoment({ moment: options?.moment, needed: options?.needed, tier: picked?.tier ?? options?.tier })
          setOpen(true)
          trackPaywallView(next)
        }
        if (!holdsMembership(standing)) return show(options)
        void import("./standing-pick").then(
          (rule) => show(rule.openOptionsFor(options ?? {}, standing)),
          () => show(options),
        )
      },
    }),
    [reset, standing],
  )
  const held = useMemo(() => ({ standing, setStanding }), [standing])
  return (
    <PaymentChannelContext.Provider value={channel}>
      <WechatPayContext.Provider value={wechatPay}>
        <StandingContext.Provider value={held}>
          <PerkFactsContext.Provider value={perkFacts}>
            <PaywallContext.Provider value={api}>
              {children}
              <PaywallSheet open={open} onOpenChange={setOpen} trigger={trigger} moment={moment.moment} needed={moment.needed} momentTier={moment.tier} products={products} state={state} />
            </PaywallContext.Provider>
          </PerkFactsContext.Provider>
        </StandingContext.Provider>
      </WechatPayContext.Provider>
    </PaymentChannelContext.Provider>
  )
}

export function usePaywall(): PaywallApi {
  const api = useContext(PaywallContext)
  if (!api) throw new Error("usePaywall needs a PaywallProvider")
  return api
}
