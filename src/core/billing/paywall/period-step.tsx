"use client"

import { useTranslations } from "next-intl"

import { BackButton } from "./back-button"
import { BillingToggle } from "./billing-toggle"
import { CheckoutBar } from "./checkout-bar"
import { productFor, yearlySavingPct, type TierOffer } from "./offer"
import { PayMethods } from "./pay-methods"
import { TierCard } from "./tier-card"
import { useCheckout } from "./use-checkout"
import type { PaywallState } from "./use-paywall-state"
import { useMoney } from "./use-money"

// Step two for a plan: Monthly / Yearly, the chosen tier's price and credits, the two payment
// groups, then Stripe. Alipay buys one period (30 days or a year), with no auto-renew.
export function PeriodStep({ offer, offers, state }: { offer: TierOffer; offers: TierOffer[]; state: PaywallState }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const checkout = useCheckout()
  const { choice, update } = state
  const product = productFor(offer, choice.period)
  const price = money(product.priceUsd)
  const fine =
    choice.method === "card"
      ? t("finePlanCard", { period: choice.period, price })
      : t("finePlanWallet", { period: choice.period })
  return (
    <>
      <BackButton onClick={() => update({ step: "tiers" })} />
      <BillingToggle period={choice.period} onChange={(period) => update({ period })} savePct={yearlySavingPct(offers)} />
      <TierCard offer={offer} period={choice.period} selected perks={null} />
      <PayMethods method={choice.method} onChange={(method) => update({ method })} kind="plan" period={choice.period} />
      <CheckoutBar
        label={t("ctaPlan", { price, period: choice.period })}
        fine={fine}
        gold={offer.tier === "max"}
        status={checkout.status}
        onClick={() => void checkout.start(product.id, choice.method)}
      />
    </>
  )
}
