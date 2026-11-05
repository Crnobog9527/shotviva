"use client"

import { useTranslations } from "next-intl"

import { cn } from "../../ui/cn"
import { CHECKOUT_METHODS, type CheckoutMethod } from "../stripe/catalog"
import type { Period } from "./offer"

type Props = { method: CheckoutMethod; onChange(method: CheckoutMethod): void; kind: "plan" | "pack"; period: Period }

// The two payment groups (DESIGN §4.5): card with Apple Pay and Google Pay, and Alipay. For a
// plan the card renews and Alipay buys one period; for a pack both are one-time.
export function PayMethods({ method, onChange, kind, period }: Props) {
  const t = useTranslations("paywall")
  const note = (m: CheckoutMethod) =>
    kind === "pack" ? t("oneTime") : m === "card" ? t("cardRenews") : t("walletOnce", { period })
  return (
    <>
      <div className="mt-6 mb-2.5 flex items-baseline justify-between px-0.5">
        <h3 className="text-headline font-semibold">{t("payWith")}</h3>
        <span className="text-caption text-muted-foreground">{t("pricesInUsd")}</span>
      </div>
      <div role="radiogroup" aria-label={t("payLabel")} className="grid gap-2">
        {CHECKOUT_METHODS.map((m) => (
          <label
            key={m}
            className={cn(
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-control bg-[var(--tier-graphite)] px-3.5",
              method === m ? "shadow-[inset_0_0_0_1.5px_var(--bone-dim)]" : "hairline",
            )}
          >
            <input
              type="radio"
              name="paywall-method"
              value={m}
              checked={method === m}
              onChange={() => onChange(m)}
              className="size-5 flex-none appearance-none rounded-full shadow-[inset_0_0_0_1.5px_var(--input)] checked:shadow-[inset_0_0_0_6px_var(--foreground)]"
            />
            <span className="flex-1 text-body leading-tight font-medium">
              {t(m)}
              <small className="mt-0.5 block text-caption font-normal text-muted-foreground">{note(m)}</small>
            </span>
            <MethodMark method={m} />
          </label>
        ))}
      </div>
    </>
  )
}

// Neutral marks only: no third-party logo files are bundled.
function MethodMark({ method }: { method: CheckoutMethod }) {
  if (method === "card") {
    return (
      <svg viewBox="0 0 28 20" aria-hidden="true" className="h-5 w-7 text-bone-dim" fill="none" stroke="currentColor">
        <rect x=".75" y=".75" width="26.5" height="18.5" rx="3.5" strokeWidth="1.5" />
        <path d="M1 6.5h26" strokeWidth="2.5" />
        <path d="M5 14h7" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 28 20" aria-hidden="true" className="h-5 w-7 text-bone-dim" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x=".75" y="2.75" width="26.5" height="16.5" rx="3.5" />
      <path d="M4 2.75l14-2 2 2" strokeLinejoin="round" />
      <rect x="18.75" y="8.25" width="8.5" height="5.5" rx="2" />
    </svg>
  )
}
