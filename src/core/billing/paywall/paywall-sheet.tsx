"use client"

import { useTranslations } from "next-intl"

import type { SiteProduct } from "../../config"
import { ResponsiveSheet } from "../../ui/responsive-sheet"
import { packOffers, tierOffers } from "./offer"
import type { PaywallTrigger } from "./paywall-context"
import { PackStep } from "./pack-step"
import { PeriodStep } from "./period-step"
import { TierStep } from "./tier-step"
import type { PaywallState } from "./use-paywall-state"

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  trigger: PaywallTrigger
  products: readonly SiteProduct[]
  wishlistLive: boolean
  state: PaywallState
}

// The paywall (DESIGN §4.5): a bottom drawer on phones, a centred dialog from md up
// (ResponsiveSheet). Step one picks a tier or the packs; step two picks the period or the pack
// and the payment method, then goes to Stripe.
export function PaywallSheet({ open, onOpenChange, trigger, products, wishlistLive, state }: Props) {
  const t = useTranslations("paywall")
  const offers = tierOffers(products)
  const packs = packOffers(products)
  const { choice } = state
  const offer = offers.find((o) => o.tier === choice.tier) ?? offers[0]
  const heading =
    choice.step === "period" && offer
      ? { title: t("periodTitle", { tier: t(`tiers.${offer.tier}`) }), description: t("periodIntro") }
      : choice.step === "packs"
        ? { title: t("packsTitle"), description: t("packsIntro") }
        : { title: t("title"), description: t(trigger === "insufficient_credits" ? "introNeedsCredits" : "intro") }
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={heading.title} description={heading.description}>
      {choice.step === "tiers" || !offer ? (
        <TierStep offers={offers} packFrom={packs[0]} wishlistLive={wishlistLive} state={state} />
      ) : choice.step === "period" ? (
        <PeriodStep offer={offer} offers={offers} state={state} />
      ) : (
        <PackStep packs={packs} state={state} />
      )}
    </ResponsiveSheet>
  )
}
