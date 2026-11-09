"use client"

import { useTranslations } from "next-intl"

import { useProductDiscount } from "./discount-context"
import { usePaymentChannel } from "./channel-context"
import { CheckoutBar } from "./checkout-bar"
import { discountTerm, planFinePrint } from "./copy"
import { checkoutTone, type ResolvedPick } from "./pick"
import { useStanding } from "./standing-context"
import { planStanding } from "./standing-pick"
import { useCheckout } from "./use-checkout"
import type { PaywallChoice } from "./use-paywall-state"
import { useMoney } from "./use-money"

// The paywall's footer: "Continue with Pro · $479/yr" or "Continue with 55 credits · $24.90",
// the fine print for the chosen method, then the hosted checkout (Stripe or Waffo, unchanged).
// For a member (T66) a higher plan reads "Upgrade to Pro · …" and the fine print adds what an
// upgrade does; the member's own or a lower plan cannot be bought and says why.
export function PaywallCheckout({ resolved, choice }: { resolved: ResolvedPick; choice: PaywallChoice }) {
  const t = useTranslations("paywall")
  const checkout = useCheckout()
  const standing = useStanding()
  const discount = useProductDiscount(resolved.product)
  const { price, fine } = useCheckoutPrice(resolved, choice, discount)
  const plan = resolved.kind === "plan" ? resolved : null
  const member = plan ? planStanding(standing, plan.offer.tier, choice.period) : { upgrade: false, lock: null }
  const note = member.upgrade ? t(standing.subscription ? "upgradeNoteCancels" : "upgradeNote") : null
  const label = plan
    ? t(member.upgrade ? "ctaUpgrade" : "ctaPlan", { tier: t(`tiers.${plan.offer.tier}`), price, period: choice.period })
    : t("ctaPack", { count: resolved.product.credits, price })
  return (
    <CheckoutBar
      label={label}
      fine={fine}
      note={note}
      tone={checkoutTone(resolved)}
      status={checkout.status}
      locked={member.lock === "current" ? t("lockCurrentNote") : member.lock ? t("lockLower") : null}
      onClick={() => void checkout.start(resolved.product.id, choice.method, discount?.offer.code)}
    />
  )
}

function useCheckoutPrice(resolved: ResolvedPick, choice: PaywallChoice, discount: ReturnType<typeof useProductDiscount>) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const channel = usePaymentChannel()
  const price = money(discount?.priceUsd ?? resolved.product.priceUsd)
  if (resolved.kind !== "plan") return { price, fine: t("finePack", { price }) }
  if (discount && choice.method !== "alipay" && discount.offer.duration !== "forever") {
    const duration = discountTerm(discount.offer, false, choice.period)
    const term = t(duration.key, duration.values)
    return { price, fine: t("fineDiscount", { price, original: money(resolved.product.priceUsd), period: choice.period, term }) }
  }
  const line = planFinePrint(channel, { method: choice.method, period: choice.period, price })
  return { price, fine: t(line.key, line.values) }
}
