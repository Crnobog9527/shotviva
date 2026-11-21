"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRef, useState } from "react"

import { ResponsiveSheet } from "../../ui/responsive-sheet"
import type { CheckoutMethod } from "../stripe/catalog"
import { CheckoutBar } from "./checkout-bar"
import { usePaymentChannel } from "./channel-context"
import { discountTerm, planFinePrint } from "./copy"
import { useProductQuote } from "./discount-context"
import { offerLabel, type Period } from "./offer"
import { PayMethods } from "./pay-methods"
import { checkoutTone, type ResolvedPick } from "./pick"
import { useStanding } from "./standing-context"
import { planStanding } from "./standing-pick"
import { useCheckout } from "./use-checkout"
import { useMoney } from "./use-money"

type Purchase = {
  resolved: ResolvedPick
  period: Period
  quote: ReturnType<typeof useProductQuote>
  label: string
  note: string | null
  locked: string | null
}

export function PaywallCheckout({ resolved, period }: { resolved: ResolvedPick; period: Period }) {
  const t = useTranslations("paywall")
  const locale = useLocale()
  const standing = useStanding()
  const quote = useProductQuote(resolved.product)
  const money = useMoney()
  const price = money(quote.priceUsd)
  const plan = resolved.kind === "plan" ? resolved : null
  const member = plan ? planStanding(standing, plan.offer.tier, period, plan.product.id) : { upgrade: false, lock: null }
  const note = member.upgrade ? t(standing.subscription ? "upgradeNoteCancels" : "upgradeNote") : null
  const label = plan
    ? t(member.upgrade ? "ctaUpgrade" : "ctaPlan", { tier: offerLabel(plan.product, locale, t(`tiers.${plan.offer.tier}`)), price, period })
    : t("ctaPack", { count: resolved.product.credits, price })
  const locked = member.lock === "current" ? t("lockCurrentNote") : member.lock ? t("lockLower") : null
  return <PaymentMethodCheckout purchase={{ resolved, period, quote, label, note, locked }} />
}

function PaymentMethodCheckout({ purchase }: { purchase: Purchase }) {
  const t = useTranslations("paywall")
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<CheckoutMethod | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const { bar, clearStatus } = usePurchaseCheckout(purchase, method)
  const pending = bar.status === "pending"
  const selectMethod = (next: CheckoutMethod | null) => {
    clearStatus()
    setMethod(next)
  }
  return (
    <>
      <CheckoutBar
        label={t("nextToPayment")}
        fine={purchase.label}
        note={purchase.note}
        tone={bar.tone}
        status="idle"
        locked={purchase.locked}
        onClick={(event) => {
          opener.current = event.currentTarget
          selectMethod(null)
          setOpen(true)
        }}
      />
      <ResponsiveSheet
        nested
        open={open}
        onOpenChange={setOpen}
        locked={pending}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          opener.current?.focus()
        }}
        title={t("choosePaymentMethod")}
        description={purchase.label}
        footer={
          <CheckoutBar
            compact
            {...bar}
            label={t("goToPayment")}
          />
        }
      >
        <PayMethods method={method} onChange={selectMethod} kind={purchase.resolved.kind} period={purchase.period} cents={purchase.quote.cents} disabled={pending} />
      </ResponsiveSheet>
    </>
  )
}

// Keep the checkout attempt in the paywall when its method picker closes, so retrying
// the same purchase after an unclear response reuses the existing idempotency key.
function usePurchaseCheckout({ resolved, period, quote, locked, note }: Purchase, method: CheckoutMethod | null) {
  const t = useTranslations("paywall")
  const checkout = useCheckout()
  const fine = useCheckoutFinePrint(resolved, period, method, quote)
  const onClick = () => {
    if (method && !locked) void checkout.start(resolved.product.id, method, quote.cents, quote.discount?.offer.code, resolved.product.revision)
  }
  return {
    clearStatus: checkout.clearStatus,
    bar: {
      fine, note, tone: checkoutTone(resolved), status: checkout.status, onClick,
      locked: locked ?? (method ? null : t("pricesInUsd")),
    },
  }
}

function useCheckoutFinePrint(resolved: ResolvedPick, period: Period, method: CheckoutMethod | null, { discount, priceUsd }: ReturnType<typeof useProductQuote>) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const channel = usePaymentChannel()
  const price = money(priceUsd)
  if (!method) return ""
  if (resolved.kind !== "plan") return t("finePack", { price })
  if (discount && method !== "alipay" && discount.offer.duration !== "forever") {
    const duration = discountTerm(discount.offer, false, period)
    const term = t(duration.key, duration.values)
    return t("fineDiscount", { price, original: money(resolved.product.priceUsd), period, term })
  }
  const line = planFinePrint(channel, { method, period, price })
  return t(line.key, line.values)
}
