"use client"

import { useTranslations } from "next-intl"

import { usePaymentChannel } from "./channel-context"
import { CheckoutBar } from "./checkout-bar"
import { planFinePrint } from "./copy"
import { checkoutTone, type ResolvedPick } from "./pick"
import { useCheckout } from "./use-checkout"
import type { PaywallChoice } from "./use-paywall-state"
import { useMoney } from "./use-money"

// The paywall's footer: "Continue with Pro · $479/yr" or "Continue with 55 credits · $24.90",
// the fine print for the chosen method, then the hosted checkout (Stripe or Waffo, unchanged).
export function PaywallCheckout({ resolved, choice }: { resolved: ResolvedPick; choice: PaywallChoice }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const checkout = useCheckout()
  const channel = usePaymentChannel()
  const price = money(resolved.product.priceUsd)
  const plan = resolved.kind === "plan" ? resolved : null
  const fine = plan ? planFinePrint(channel, { method: choice.method, period: choice.period, price }) : { key: "finePack", values: { price } }
  const label = plan
    ? t("ctaPlan", { tier: t(`tiers.${plan.offer.tier}`), price, period: choice.period })
    : t("ctaPack", { count: resolved.product.credits, price })
  return (
    <CheckoutBar
      label={label}
      fine={t(fine.key, fine.values)}
      tone={checkoutTone(resolved)}
      status={checkout.status}
      onClick={() => void checkout.start(resolved.product.id, choice.method)}
    />
  )
}
