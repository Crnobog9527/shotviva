"use client"

import { useTranslations } from "next-intl"

import { buttonVariants } from "../../ui/button"
import { cn } from "../../ui/cn"
import type { CheckoutStatus } from "./use-checkout"

type Props = { label: string; fine: string; gold?: boolean; status: CheckoutStatus; onClick(): void }

// Sticky bottom of the sheet: the one primary (bone; gold foil for Max) and its fine print.
export function CheckoutBar({ label, fine, gold = false, status, onClick }: Props) {
  const t = useTranslations("paywall")
  const pending = status === "pending"
  return (
    <div className="sticky bottom-0 -mx-4 mt-5 bg-[linear-gradient(transparent,var(--popover)_30%)] px-4 pt-3 pb-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        className={buttonVariants({
          variant: "cta-neutral",
          size: "cta",
          className: cn(gold && "bg-[image:var(--chrome)] text-[var(--tier-max-ink)]"),
        })}
      >
        {pending ? t("redirecting") : label}
      </button>
      <p className="mt-2 text-center text-caption leading-[1.4] text-muted-foreground" aria-live="polite">
        {status === "error" ? <span className="text-destructive">{t("error")}</span> : fine}
      </p>
    </div>
  )
}
