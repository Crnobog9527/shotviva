"use client"

import { useTranslations } from "next-intl"

import type { PackProduct } from "../../config"
import { cn } from "../../ui/cn"
import { BackButton } from "./back-button"
import { CheckoutBar } from "./checkout-bar"
import { perCreditUsd } from "./offer"
import { PayMethods } from "./pay-methods"
import { useCheckout } from "./use-checkout"
import type { PaywallState } from "./use-paywall-state"
import { PackCredits } from "./pack-credits"
import { useMoney } from "./use-money"

// Step two from "Credit packs": S / M / L, each one-time and open to everyone (§6.2), then the
// two payment groups. A pack never changes the membership period.
export function PackStep({ packs, state }: { packs: PackProduct[]; state: PaywallState }) {
  const t = useTranslations("paywall")
  const money = useMoney()
  const checkout = useCheckout()
  const { choice, update } = state
  const pack = packs.find((p) => p.id === choice.packId) ?? packs[0]
  if (!pack) return null
  const price = money(pack.priceUsd)
  return (
    <>
      <BackButton onClick={() => update({ step: "tiers" })} />
      <div role="radiogroup" aria-label={t("packsLabel")} className="mt-3 grid gap-2">
        {packs.map((p) => (
          <label
            key={p.id}
            className={cn(
              "press flex min-h-16 cursor-pointer items-center gap-3 rounded-control bg-[var(--tier-graphite)] px-4 py-3",
              p.id === pack.id ? "shadow-[inset_0_0_0_1.5px_var(--foreground)]" : "hairline",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            )}
          >
            <input type="radio" name="paywall-pack" value={p.id} checked={p.id === pack.id} onChange={() => update({ packId: p.id })} className="sr-only" />
            <span className="flex-1">
              <PackCredits count={p.credits} />
              <span className="mt-1.5 block text-caption text-muted-foreground">{t("oneTimeNoSub")}</span>
            </span>
            <span className="text-right">
              <span className="block text-body font-semibold">{money(p.priceUsd)}</span>
              <span className="mt-1 block font-mono text-caption text-muted-foreground">{t("perCreditShort", { price: money(perCreditUsd(p)) })}</span>
            </span>
          </label>
        ))}
      </div>
      <PayMethods method={choice.method} onChange={(method) => update({ method })} kind="pack" period="month" />
      <CheckoutBar label={t("ctaPack", { price })} fine={t("finePack", { price })} status={checkout.status} onClick={() => void checkout.start(pack.id, choice.method)} />
    </>
  )
}
